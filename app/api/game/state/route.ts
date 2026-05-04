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
    const queryWallet = request.nextUrl.searchParams.get("wallet");
    const walletAddress = session?.wallet ?? queryWallet;
    const snapshot = gameStore.getSnapshot(walletAddress);
    // Mark the session as active only when a valid signed cookie exists AND
    // it matches the wallet currently in scope. Without this flag the client
    // cannot distinguish "we have a real signed session" from "we just looked
    // up this wallet via the ?wallet= fallback", which leads to the user
    // appearing logged-in after disconnect or cookie expiry.
    snapshot.sessionActive = Boolean(
      session?.wallet &&
        walletAddress &&
        session.wallet.toLowerCase() === walletAddress.toLowerCase(),
    );
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error) {
    logger.error("state_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
