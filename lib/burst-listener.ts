import { parseEther, type Hex } from "viem";

import { ACTIVE_CONTRACT, baseSepoliaPublicClient, isContractConfigured } from "@/lib/base";
import { BURST } from "@/lib/game-config";
import { gameStore } from "@/lib/game-store";
import { logger } from "@/lib/logger";

type ListenerGlobals = typeof globalThis & {
  __cwBurstListenerStarted?: boolean;
  __cwProcessedBurstTxHashes?: Set<Hex>;
  __cwBurstUnwatch?: (() => void) | null;
};

const globals = globalThis as ListenerGlobals;

function getProcessed(): Set<Hex> {
  if (!globals.__cwProcessedBurstTxHashes) {
    globals.__cwProcessedBurstTxHashes = new Set<Hex>();
  }
  return globals.__cwProcessedBurstTxHashes;
}

const BURST_VALUE_WEI = parseEther(BURST.priceEth);

export function ensureBurstListener() {
  if (!isContractConfigured || !ACTIVE_CONTRACT) {
    return { started: false, reason: "contract_not_configured" } as const;
  }
  if (globals.__cwBurstListenerStarted) {
    return { started: true, reason: "already_running" } as const;
  }

  const target = ACTIVE_CONTRACT.toLowerCase();
  const processed = getProcessed();

  globals.__cwBurstListenerStarted = true;
  globals.__cwBurstUnwatch = baseSepoliaPublicClient.watchBlocks({
    includeTransactions: true,
    onError(error) {
      console.error("[color-wars] burst listener error", error);
    },
    async onBlock(block) {
      const txs = block.transactions;
      if (!txs || typeof txs[0] === "string") return;
      for (const tx of txs as Array<{
        hash: Hex;
        to: `0x${string}` | null;
        from: `0x${string}`;
        value: bigint;
        input?: Hex;
      }>) {
        if (!tx.to || tx.to.toLowerCase() !== target) continue;
        if (tx.value !== BURST_VALUE_WEI) continue;
        if (tx.input && tx.input !== "0x" && tx.input !== "0x00") continue;
        if (processed.has(tx.hash)) continue;

        try {
          const receipt = await baseSepoliaPublicClient.waitForTransactionReceipt({ hash: tx.hash });
          if (receipt.status !== "success") continue;
          processed.add(tx.hash);
          const result = gameStore.activateBurstFromChain(tx.from);
          logger.info("burst_activated_from_chain", {
            wallet: tx.from,
            txHash: tx.hash,
            ok: result.ok,
            message: result.message,
          });
        } catch (error) {
          logger.error("burst_confirm_failed", { error: (error as Error)?.message });
        }
      }
    },
  });

  return { started: true, reason: "started" } as const;
}
