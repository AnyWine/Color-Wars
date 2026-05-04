import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage as verifyMessageUtil } from "viem";

import { consumeNonce } from "@/lib/auth-nonce";
import { basePublicClient, baseSepoliaPublicClient } from "@/lib/base";
import { TEAM_ORDER } from "@/lib/game-config";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";
import { clearSessionCookie, issueSession } from "@/lib/session";
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
    const errors: { stage: string; error: string }[] = [];
    // Sanitize raw viem / provider errors before either logging them or
    // exposing them on the wire. viem's HttpRequestError embeds the full
    // transport URL in the message (e.g.
    // "URL: https://base-mainnet.g.alchemy.com/v2/<API_KEY>"), so we strip
    // any http(s) URL substrings and collapse whitespace. We deliberately
    // also strip URLs from server-side logs — provider API keys should
    // never end up in log output, defence in depth.
    const sanitizeError = (raw: unknown): string => {
      const message = (raw as Error)?.message ?? "unknown";
      return message
        .replace(/https?:\/\/\S+/gi, "[redacted-url]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
    };
    try {
      valid = await verifyMessageUtil({
        address: body.walletAddress,
        message: body.message,
        signature: body.signature,
      });
      if (valid) verificationPath = "eoa";
    } catch (error) {
      errors.push({ stage: "eoa", error: sanitizeError(error) });
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
        errors.push({ stage: "mainnet", error: sanitizeError(error) });
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
        errors.push({ stage: "sepolia", error: sanitizeError(error) });
      }
    }
    if (!valid) {
      const diagnostic = {
        signaturePrefix: body.signature.slice(0, 12),
        signatureLength: body.signature.length,
        messageLength: body.message.length,
        baseRpcConfigured: Boolean(process.env.BASE_RPC_URL),
        baseSepoliaRpcConfigured: Boolean(process.env.BASE_SEPOLIA_RPC_URL),
        errors,
      };
      logger.warn("auth_signature_invalid", { wallet: body.walletAddress, ...diagnostic });
      // Surface diagnostics in the response body so the issue can be triaged
      // even when Vercel runtime logs are not accessible. No secret material
      // is exposed — only signature shape and RPC error strings.
      return NextResponse.json(
        {
          ok: false,
          message: "Signature verification failed.",
          diagnostic,
        },
        { status: 401 },
      );
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

export async function DELETE() {
  // Client-initiated logout: drop the session cookie so the next paint /
  // burst / purchase request lands in the unauthenticated branch and
  // forces the user to sign again. The on-chain wallet disconnect is
  // handled separately by wagmi on the client.
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}
