import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

import { issueNonce } from "@/lib/auth-nonce";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    if (!wallet || !isAddress(wallet)) {
      return NextResponse.json(
        { ok: false, message: "Valid wallet address is required." },
        { status: 400 },
      );
    }

    if (!consumeToken(`nonce:${wallet.toLowerCase()}`, 12, 6)) {
      return NextResponse.json(
        { ok: false, message: "Too many nonce requests." },
        { status: 429 },
      );
    }

    const nonce = await issueNonce(wallet);
    return NextResponse.json(
      { ok: true, nonce },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("nonce_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
