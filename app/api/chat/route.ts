import { NextRequest, NextResponse } from "next/server";

import { chatStore, MAX_MESSAGE_LENGTH } from "@/lib/chat-store";
import { logger } from "@/lib/logger";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

type ChatPayload = {
  text?: string;
};

export async function GET() {
  try {
    return NextResponse.json({ messages: chatStore.list() });
  } catch (error) {
    logger.error("chat_get_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
    }

    let body: ChatPayload;
    try {
      body = (await request.json()) as ChatPayload;
    } catch {
      return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text : "";
    if (text.trim().length === 0) {
      return NextResponse.json({ ok: false, message: "Message is empty." }, { status: 400 });
    }
    if (text.length > MAX_MESSAGE_LENGTH * 2) {
      return NextResponse.json({ ok: false, message: "Message too long." }, { status: 400 });
    }

    if (!checkSlidingWindow(`chat:${session.wallet}`, 5, 10_000)) {
      logger.warn("chat_rate_limited", { wallet: session.wallet });
      return NextResponse.json({ ok: false, message: "Slow down." }, { status: 429 });
    }

    const entry = chatStore.append({ address: session.wallet, team: session.color, text });
    if (!entry) {
      return NextResponse.json({ ok: false, message: "Message rejected." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: entry });
  } catch (error) {
    logger.error("chat_post_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
