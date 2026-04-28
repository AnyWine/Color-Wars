import type { Hex } from "viem";

import { ACTIVE_CONTRACT, ACTIVE_CONTRACT_ABI, baseSepoliaPublicClient, isContractConfigured } from "@/lib/base";
import { gameStore } from "@/lib/game-store";

type ListenerGlobals = typeof globalThis & {
  __colorWarsPurchaseListenerStarted?: boolean;
  __colorWarsProcessedTxHashes?: Set<Hex>;
  __colorWarsPurchaseUnwatch?: (() => void) | null;
};

const globals = globalThis as ListenerGlobals;

function getProcessedTxHashes() {
  if (!globals.__colorWarsProcessedTxHashes) {
    globals.__colorWarsProcessedTxHashes = new Set<Hex>();
  }

  return globals.__colorWarsProcessedTxHashes;
}

export function ensurePurchaseListener() {
  if (!isContractConfigured || !ACTIVE_CONTRACT) {
    return {
      started: false,
      reason: "contract_not_configured",
    } as const;
  }

  if (globals.__colorWarsPurchaseListenerStarted) {
    return {
      started: true,
      reason: "already_running",
    } as const;
  }

  const processedTxHashes = getProcessedTxHashes();

  globals.__colorWarsPurchaseListenerStarted = true;
  globals.__colorWarsPurchaseUnwatch = baseSepoliaPublicClient.watchContractEvent({
    address: ACTIVE_CONTRACT,
    abi: ACTIVE_CONTRACT_ABI,
    eventName: "PixelsPurchased",
    pollingInterval: 2_000,
    onError(error) {
      console.error("[color-wars] purchase listener error", error);
    },
    onLogs(logs) {
      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txHash) continue;
        if (processedTxHashes.has(txHash)) continue;

        const user = log.args.user;
        const pixels = log.args.pixels ? Number(log.args.pixels) : 0;

        if (!user || pixels <= 0) continue;

        processedTxHashes.add(txHash);
        gameStore.creditPurchasedPixels(user, pixels, txHash);
      }
    },
  });

  return {
    started: true,
    reason: "started",
  } as const;
}
