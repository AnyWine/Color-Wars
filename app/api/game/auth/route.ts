import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage as verifyMessageUtil } from "viem";

import { consumeNonce } from "@/lib/auth-nonce";
import { basePublicClient, baseSepoliaPublicClient } from "@/lib/base";
import { TEAM_ORDER } from "@/lib/game-config";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";
import { issueSession } from "@/lib/session";
import { refreshFromPersistence, save } from "@/lib/store/persist";
import type { TeamColor } from "@/lib/types";

type AuthPayload = {
  walletAddress?: string;
  color?: TeamColor;
  message?: string;
  signature?: `0x${string}`;
};

function isTeamColor(value: unknown): value is TeamColor {
  return typeof value === "string" && TEAM_ORDER.includes(value as TeamColor);
}

function extractNonce(message: string): string | null {
  const match = message.match(/nonce:([a-f0-9]{32})/i);
  return match ? match[1].toLowerCase() : null;
}

function fail(reason: string, status: number, walletForLog?: string) {
  logger.warn("auth_failed", { reason, wallet: walletForLog });
  return NextResponse.json({ ok: false, message: reason }, { status });
}

export async function POST(request: NextRequest) {
  try {
    let body: AuthPayload;
    try {
      body = (await request.json()) as AuthPayload;
    } catch {
      return fail("Invalid JSON.", 400);
    }

    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return fail("Valid wallet address is required.", 400);
    }
    if (!isTeamColor(body.color)) {
      return fail("Choose one of the three teams.", 400, body.walletAddress);
    }
    if (!body.message || !body.signature) {
      return fail("Signed message is required.", 400, body.walletAddress);
    }

    if (!consumeToken(`auth:${body.walletAddress.toLowerCase()}`, 8, 4)) {
      return fail("Too many auth attempts. Slow down.", 429, body.walletAddress);
    }

    const nonce = extractNonce(body.message);
    if (!nonce || !(await consumeNonce(body.walletAddress, nonce))) {
      return fail("Auth nonce invalid or expired.", 401, body.walletAddress);
    }

    // Verify the signature. We have to handle three account types:
    //   1. Externally Owned Accounts (EOA) — fast off-chain ECDSA recovery
    //      via viem's pure utility.
    //   2. Smart contract wallets (ERC-1271, e.g. Coinbase Smart Wallet,
    //      Safe, Magic) — the wallet contract's `isValidSignature` must be
    //      called on-chain. This requires a public client.
    //   3. Pre-deployed smart wallets (ERC-6492) — same as above but the
    //      signature is wrapped with the deploy init code so we can verify
    //      before the wallet contract is actually on-chain. viem's public
    //      client `verifyMessage` handles the unwrap.
    //
    // Smart wallets used inside Base App are typically deployed on Base
    // mainnet, even when the user is interacting with our Sepolia game
    // contract, so we try both chains and accept the signature if either
    // verifies.
    let valid = false;
    let verificationPath: "eoa" | "mainnet" | "sepolia" | "none" = "none";
    let lastError: string | undefined;
    try {
      valid = await verifyMessageUtil({
        address: body.walletAddress,
        message: body.message,
        signature: body.signature,
      });
      if (valid) verificationPath = "eoa";
    } catch (error) {
      lastError = (error as Error)?.message;
    }
    if (!valid) {
      try {
        valid = await basePublicClient.verifyMessage({
          address: body.walletAddress,
          message: body.message,
          signature: body.signature,
        });
        if (valid) verificationPath = "mainnet";
      } catch (error) {
        lastError = (error as Error)?.message;
      }
    }
    if (!valid) {
      try {
        valid = await baseSepoliaPublicClient.verifyMessage({
          address: body.walletAddress,
          message: body.message,
          signature: body.signature,
        });
        if (valid) verificationPath = "sepolia";
      } catch (error) {
        lastError = (error as Error)?.message;
      }
    }
    if (!valid) {
      logger.warn("auth_signature_invalid", {
        wallet: body.walletAddress,
        signaturePrefix: body.signature.slice(0, 10),
        signatureLength: body.signature.length,
        messageLength: body.message.length,
        error: lastError,
      });
      return fail("Signature verification failed.", 401, body.walletAddress);
    }

    await refreshFromPersistence();
    const user = gameStore.authenticate(body.walletAddress, body.color, body.message);
    // Save synchronously instead of the usual deferred markDirty(). Auth
    // must reach Redis before this response leaves, otherwise the very next
    // paint click can land on a different Vercel lambda that hasn't yet
    // observed the save and rejects with "Sign in first" / "Choose a team".
    // From the user's perspective that looked like the wallet popping up on
    // every click. Synchronous save closes the cross-lambda race.
    await save();
    const { cookie } = issueSession({ wallet: body.walletAddress, color: body.color });

    logger.info("auth_success", {
      wallet: body.walletAddress,
      color: body.color,
      verificationPath,
    });

    const response = NextResponse.json({ ok: true, user });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    logger.error("auth_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
