import { NextRequest, NextResponse } from "next/server";

import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { refreshFromPersistence } from "@/lib/store/persist";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await refreshFromPersistence();
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    const walletAddress = session?.wallet ?? request.nextUrl.searchParams.get("wallet");
    const snapshot = gameStore.getSnapshot(walletAddress);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error) {
    logger.error("state_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
