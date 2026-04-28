import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

import { issueNonce } from "@/lib/auth-nonce";
import { logger } from "@/lib/logger";

export function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    if (!wallet || !isAddress(wallet)) {
      return NextResponse.json({ ok: false, message: "Valid wallet address is required." }, { status: 400 });
    }
    const nonce = issueNonce(wallet);
    return NextResponse.json({ ok: true, nonce });
  } catch (error) {
    logger.error("nonce_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
