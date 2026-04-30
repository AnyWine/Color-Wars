import { NextRequest, NextResponse } from "next/server";

import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { markDirty, refreshFromPersistence } from "@/lib/store/persist";

type PaintPayload = {
  x?: unknown;
  y?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    console.log("PAINT CALLED");
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    console.log("SESSION:", session);
    if (!session) {
      return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
    }

    let body: PaintPayload;
    try {
      body = (await request.json()) as PaintPayload;
    } catch {
      return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
    }

    const { x, y } = body;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      return NextResponse.json(
        { ok: false, message: "Pixel coordinates must be integers." },
        { status: 400 },
      );
    }

    if (!consumeToken(`paint:${session.wallet}`, 12, 10)) {
      logger.warn("paint_rate_limited", { wallet: session.wallet });
      return NextResponse.json({ ok: false, message: "Too many paint requests." }, { status: 429 });
    }

    console.log("PAINT COLOR:", session.color);

    await refreshFromPersistence();
    const result = gameStore.paint(session.wallet, x, y, session.color);
    if (result.ok) markDirty();

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    logger.error("paint_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
