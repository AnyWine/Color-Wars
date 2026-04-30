import { randomBytes } from "node:crypto";

import { redis } from "@/lib/store/redis";

const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_TTL_SEC = Math.floor(NONCE_TTL_MS / 1000);

type NonceEntry = { nonce: string; expiresAt: number };

const globalRef = globalThis as unknown as { __cwAuthNonces?: Map<string, NonceEntry> };
if (!globalRef.__cwAuthNonces) {
  globalRef.__cwAuthNonces = new Map<string, NonceEntry>();
}
const memoryStore = globalRef.__cwAuthNonces;

function key(wallet: string) {
  return wallet.trim().toLowerCase();
}

function redisKey(wallet: string) {
  return `colorwars:nonce:${key(wallet)}`;
}

function pruneMemory(now: number) {
  for (const [k, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(k);
  }
}

/**
 * Issue a single-use nonce for the given wallet and store it both in-memory
 * (for warm-lambda local lookups) and in Redis (so consumption from a different
 * lambda still finds it). Always returns a fresh nonce — any previous nonce
 * for the same wallet is overwritten.
 */
export async function issueNonce(wallet: string): Promise<string> {
  const now = Date.now();
  pruneMemory(now);

  const nonce = randomBytes(16).toString("hex");
  memoryStore.set(key(wallet), { nonce, expiresAt: now + NONCE_TTL_MS });

  if (redis.isConfigured()) {
    try {
      await redis.setex(redisKey(wallet), NONCE_TTL_SEC, nonce);
    } catch {
      /* fall back to memory only */
    }
  }

  return nonce;
}

/**
 * Atomically validate and consume the nonce. Always single-use — once consumed
 * it cannot be replayed. Returns false if the nonce is missing, expired, or
 * does not match.
 */
export async function consumeNonce(wallet: string, nonce: string): Promise<boolean> {
  const now = Date.now();
  pruneMemory(now);

  const k = key(wallet);
  const entry = memoryStore.get(k);

  if (entry && entry.expiresAt > now && entry.nonce === nonce) {
    memoryStore.delete(k);
    if (redis.isConfigured()) {
      try {
        await redis.del(redisKey(wallet));
      } catch {
        /* best effort */
      }
    }
    return true;
  }

  if (redis.isConfigured()) {
    try {
      const stored = await redis.getAndDel(redisKey(wallet));
      if (stored && stored === nonce) {
        memoryStore.delete(k);
        return true;
      }
    } catch {
      /* fall through to fail */
    }
  }

  return false;
}
