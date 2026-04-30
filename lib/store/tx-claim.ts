/**
 * Cross-lambda one-shot claim for on-chain transaction hashes.
 *
 * Both `/api/game/purchase` and `/api/game/burst` need to credit a wallet
 * exactly once per accepted on-chain transaction. The previous in-memory
 * `Set<txHash>` only worked within a single lambda instance, so a user could
 * submit the same txHash to a second lambda (or the same lambda after a cold
 * start) and get credited twice from one payment.
 *
 * This helper does an atomic `SET … NX EX <ttl>` against Redis. The first
 * caller wins; everyone else sees a 409. When Redis is not configured we fall
 * back to a process-local `Set` (single-instance dev only).
 */

import { redis } from "@/lib/store/redis";

const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days; way longer than any tx is meaningfully replayable

const memoryFallback = new Set<string>();

export type ClaimResult = "claimed" | "already-processed";

export async function claimTxHash(scope: string, txHash: string): Promise<ClaimResult> {
  const key = `colorwars:processed:${scope}:${txHash.toLowerCase()}`;

  if (redis.isConfigured()) {
    const ok = await redis.claim(key, PROCESSED_TTL_SECONDS);
    return ok ? "claimed" : "already-processed";
  }

  if (memoryFallback.has(key)) return "already-processed";
  memoryFallback.add(key);
  return "claimed";
}

/**
 * Best-effort release used when a mutation fails after the claim succeeded
 * (e.g. the gameStore rejected the credit). Releases the lock so the user can
 * legitimately retry. Errors are swallowed; we'd rather leave a stale claim
 * than throw on the error path.
 */
export async function releaseTxHash(scope: string, txHash: string): Promise<void> {
  const key = `colorwars:processed:${scope}:${txHash.toLowerCase()}`;
  if (redis.isConfigured()) {
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
    return;
  }
  memoryFallback.delete(key);
}
