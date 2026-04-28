import { NextRequest, NextResponse } from "next/server";

import { ensureBurstListener } from "@/lib/burst-listener";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { ensurePurchaseListener } from "@/lib/pixel-purchase-listener";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export function GET(request: NextRequest) {
  try {
    ensurePurchaseListener();
    ensureBurstListener();
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    const walletAddress = session?.wallet ?? request.nextUrl.searchParams.get("wallet");
    return NextResponse.json(gameStore.getSnapshot(walletAddress));
  } catch (error) {
    logger.error("state_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
