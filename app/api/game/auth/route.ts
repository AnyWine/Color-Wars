import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";

import { consumeNonce } from "@/lib/auth-nonce";
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

    let valid = false;
    try {
      valid = await verifyMessage({
        address: body.walletAddress,
        message: body.message,
        signature: body.signature,
      });
    } catch {
      valid = false;
    }
    if (!valid) {
      return fail("Signature verification failed.", 401, body.walletAddress);
    }

    await refreshFromPersistence();
    const user = gameStore.authenticate(body.walletAddress, body.color, body.message);
    // Save synchronously here (instead of the usual `markDirty()` deferred
    // save). Auth must reach Redis before we respond, otherwise the very next
    // paint click can land on a different lambda that hasn't seen this user's
    // team yet — which on the old code path made paint reject ("Choose a
    // team") or stamp the wrong color, and from the user's perspective looked
    // like "wallet asks for signature on every click" + "pink turns blue".
    await save();
    const { cookie } = issueSession({ wallet: body.walletAddress, color: body.color });

    logger.info("auth_success", { wallet: body.walletAddress, color: body.color });

    const response = NextResponse.json({ ok: true, user });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    logger.error("auth_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
