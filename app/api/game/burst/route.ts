import { NextRequest, NextResponse } from "next/server";
import { parseEther, type Hex } from "viem";

import {
  ACTIVE_CONTRACT,
  baseSepoliaPublicClient,
  isContractConfigured,
} from "@/lib/base";
import { BURST } from "@/lib/game-config";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { hydrateOnce, markDirty } from "@/lib/store/persist";

type BurstPayload = {
  txHash?: unknown;
};

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const BURST_VALUE_WEI = parseEther(BURST.priceEth);

const globalRef = globalThis as unknown as {
  __cwBurstProcessedTxHashes?: Set<Hex>;
};
if (!globalRef.__cwBurstProcessedTxHashes) {
  globalRef.__cwBurstProcessedTxHashes = new Set<Hex>();
}
const processed = globalRef.__cwBurstProcessedTxHashes;

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

    if (!consumeToken(`burst:${session.wallet}`, 6, 10)) {
      return NextResponse.json({ ok: false, message: "Too many burst requests." }, { status: 429 });
    }

    let body: BurstPayload;
    try {
      body = (await request.json()) as BurstPayload;
    } catch {
      return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
    }

    const txHash = typeof body.txHash === "string" ? body.txHash : "";
    if (!TX_HASH_RE.test(txHash)) {
      return NextResponse.json({ ok: false, message: "Valid txHash is required." }, { status: 400 });
    }
    const hash = txHash as Hex;

    if (processed.has(hash)) {
      return NextResponse.json({ ok: false, message: "Burst already credited for this tx." }, { status: 409 });
    }

    let receipt;
    try {
      receipt = await baseSepoliaPublicClient.waitForTransactionReceipt({
        hash,
        timeout: 30_000,
      });
    } catch (error) {
      logger.warn("burst_receipt_failed", { hash, error: (error as Error)?.message });
      return NextResponse.json(
        { ok: false, message: "Could not confirm transaction. Try again in a few seconds." },
        { status: 504 },
      );
    }

    if (receipt.status !== "success") {
      return NextResponse.json({ ok: false, message: "Transaction reverted." }, { status: 400 });
    }

    let tx;
    try {
      tx = await baseSepoliaPublicClient.getTransaction({ hash });
    } catch (error) {
      logger.warn("burst_tx_lookup_failed", { hash, error: (error as Error)?.message });
      return NextResponse.json(
        { ok: false, message: "Could not load transaction details." },
        { status: 502 },
      );
    }

    if (tx.from.toLowerCase() !== session.wallet.toLowerCase()) {
      return NextResponse.json(
        { ok: false, message: "Transaction was sent by a different wallet." },
        { status: 400 },
      );
    }
    if (!tx.to || tx.to.toLowerCase() !== ACTIVE_CONTRACT.toLowerCase()) {
      return NextResponse.json(
        { ok: false, message: "Transaction was sent to the wrong contract." },
        { status: 400 },
      );
    }
    if (tx.value !== BURST_VALUE_WEI) {
      return NextResponse.json(
        { ok: false, message: "Transaction value does not match the burst price." },
        { status: 400 },
      );
    }
    if (tx.input && tx.input !== "0x" && tx.input !== "0x00") {
      return NextResponse.json(
        { ok: false, message: "Burst tx must be a plain ETH transfer to the contract." },
        { status: 400 },
      );
    }

    await hydrateOnce();
    const result = gameStore.activateBurstFromChain(session.wallet);
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
        burstUntil: snapshot.user?.burstUntil ?? null,
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    logger.error("burst_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
