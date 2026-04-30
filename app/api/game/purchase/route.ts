import { NextRequest, NextResponse } from "next/server";
import { decodeEventLog, type Hex } from "viem";

import {
  ACTIVE_CONTRACT,
  ACTIVE_CONTRACT_ABI,
  baseSepoliaPublicClient,
  isContractConfigured,
} from "@/lib/base";
import { PACK_BY_PIXELS } from "@/lib/color-wars-v1";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { markDirty, refreshFromPersistence } from "@/lib/store/persist";

type PurchasePayload = {
  txHash?: unknown;
};

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const globalRef = globalThis as unknown as {
  __cwPurchaseProcessedTxHashes?: Set<Hex>;
};
if (!globalRef.__cwPurchaseProcessedTxHashes) {
  globalRef.__cwPurchaseProcessedTxHashes = new Set<Hex>();
}
const processed = globalRef.__cwPurchaseProcessedTxHashes;

export async function POST(request: NextRequest) {
  try {
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
    }

    if (!isContractConfigured || !ACTIVE_CONTRACT) {
      return NextResponse.json(
        { ok: false, message: "Contract not configured." },
        { status: 503 },
      );
    }

    if (!consumeToken(`purchase:${session.wallet}`, 6, 10)) {
      return NextResponse.json(
        { ok: false, message: "Too many purchase requests." },
        { status: 429 },
      );
    }

    let body: PurchasePayload;
    try {
      body = (await request.json()) as PurchasePayload;
    } catch {
      return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
    }

    const txHash = typeof body.txHash === "string" ? body.txHash : "";
    if (!TX_HASH_RE.test(txHash)) {
      return NextResponse.json(
        { ok: false, message: "Valid txHash is required." },
        { status: 400 },
      );
    }
    const hash = txHash as Hex;

    if (processed.has(hash)) {
      return NextResponse.json(
        { ok: false, message: "Purchase already credited for this tx." },
        { status: 409 },
      );
    }

    let receipt;
    try {
      receipt = await baseSepoliaPublicClient.waitForTransactionReceipt({
        hash,
        timeout: 30_000,
      });
    } catch (error) {
      logger.warn("purchase_receipt_failed", { hash, error: (error as Error)?.message });
      return NextResponse.json(
        { ok: false, message: "Could not confirm transaction. Try again in a few seconds." },
        { status: 504 },
      );
    }

    if (receipt.status !== "success") {
      return NextResponse.json({ ok: false, message: "Transaction reverted." }, { status: 400 });
    }

    const targetAddress = ACTIVE_CONTRACT.toLowerCase();
    let pixels = 0;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== targetAddress) continue;
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: ACTIVE_CONTRACT_ABI,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        continue;
      }
      if (decoded.eventName !== "PixelsPurchased") continue;

      const args = decoded.args as { user?: string; pixels?: bigint };
      if (!args.user || args.user.toLowerCase() !== session.wallet.toLowerCase()) {
        continue;
      }
      pixels = args.pixels ? Number(args.pixels) : 0;
      break;
    }

    if (pixels <= 0) {
      return NextResponse.json(
        { ok: false, message: "No PixelsPurchased event found for this wallet." },
        { status: 400 },
      );
    }

    const pack = PACK_BY_PIXELS[pixels as keyof typeof PACK_BY_PIXELS];
    if (!pack) {
      return NextResponse.json(
        { ok: false, message: "Unknown pack size." },
        { status: 400 },
      );
    }

    await refreshFromPersistence();
    const result = gameStore.creditPurchasedPixels(session.wallet, pack.px, hash);
    if (result.ok) {
      processed.add(hash);
      markDirty();
    }

    const snapshot = gameStore.getSnapshot(session.wallet);
    return NextResponse.json(
      {
        ok: result.ok,
        message: result.message,
        user: snapshot.user,
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    logger.error("purchase_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
