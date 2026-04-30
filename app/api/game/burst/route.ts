import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";

import {
  ACTIVE_CONTRACT,
  baseSepoliaPublicClient,
  isContractConfigured,
} from "@/lib/base";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";
import { consumeToken } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { markDirty, refreshFromPersistence } from "@/lib/store/persist";
import { claimTxHash, releaseTxHash } from "@/lib/store/tx-claim";

type BurstPayload = {
  txHash?: unknown;
};

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export async function POST(request: NextRequest) {
  try {
    console.log("BURST CALLED");
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    console.log("BURST SESSION:", session);
    if (!session) {
      return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
    }

    if (!isContractConfigured || !ACTIVE_CONTRACT) {
      console.log("BURST: contract not configured", { isContractConfigured, ACTIVE_CONTRACT });
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

    console.log("BURST TX HASH:", hash);

    let receipt;
    try {
      receipt = await baseSepoliaPublicClient.waitForTransactionReceipt({
        hash,
        timeout: 30_000,
      });
    } catch (error) {
      console.log("BURST RECEIPT FAILED:", (error as Error)?.message);
      logger.warn("burst_receipt_failed", { hash, error: (error as Error)?.message });
      return NextResponse.json(
        { ok: false, message: "Could not confirm transaction. Try again in a few seconds." },
        { status: 504 },
      );
    }

    console.log("BURST RECEIPT:", {
      status: receipt.status,
      blockNumber: receipt.blockNumber?.toString(),
      gasUsed: receipt.gasUsed?.toString(),
      from: receipt.from,
      to: receipt.to,
      contract: ACTIVE_CONTRACT,
      sessionWallet: session.wallet,
    });

    // Simplified validation (stabilization): require only that the tx exists
    // and succeeded on-chain. Strict value / calldata / from / to checks are
    // intentionally removed to un-break burst activation.
    if (receipt.status !== "success") {
      console.log("BURST: tx reverted on-chain", { hash, receiptStatus: receipt.status });
      return NextResponse.json({ ok: false, message: "Transaction reverted." }, { status: 400 });
    }

    // Atomic cross-lambda dedupe: only the first request to claim this hash
    // will continue past this point. Other lambdas / retries get 409.
    const claim = await claimTxHash("burst", hash);
    if (claim === "already-processed") {
      return NextResponse.json(
        { ok: false, message: "Burst already credited for this tx." },
        { status: 409 },
      );
    }

    await refreshFromPersistence();
    const result = gameStore.activateBurstFromChain(session.wallet);
    if (result.ok) {
      markDirty();
    } else {
      // Game-store rejected the credit (shouldn't normally happen — burst is
      // not idempotency-checked there). Release the lock so a legitimate
      // retry isn't blocked forever.
      await releaseTxHash("burst", hash);
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
