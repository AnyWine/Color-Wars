/**
 * Persistence wiring for the in-memory game store.
 *
 * - `hydrateOnce()` — reads the persisted snapshot from Redis exactly once per
 *   lambda lifetime and rehydrates `lib/game-store.ts`. Subsequent calls are
 *   no-ops. Safe to call from every API route handler that mutates state.
 * - `save()` — writes the full snapshot back to Redis. Best-effort, awaited so
 *   the route handler can pair it with `after()` for post-response saves.
 * - `markDirty()` — convenience: schedule a `save()` via Next.js `after()` so
 *   it runs after the response has been sent. Falls back to a fire-and-forget
 *   promise on hosts without `after()` support.
 *
 * If Redis is not configured, all of these are no-ops and the store keeps
 * behaving as a pure in-memory state (acceptable for local dev only).
 */

import { after } from "next/server";

import { logger } from "@/lib/logger";
import { redis } from "@/lib/store/redis";
import { getBackend } from "@/lib/game-state";

const STATE_KEY = "colorwars:state:v1";

const globalRef = globalThis as unknown as { __cwHydratePromise?: Promise<void> };

export function isHydrated(): boolean {
  return Boolean(globalRef.__cwHydratePromise);
}

async function doHydrate(): Promise<void> {
  if (!redis.isConfigured()) return;

  try {
    const raw = await redis.get(STATE_KEY);
    if (!raw) return;
    const backend = getBackend();
    if (!backend) return;
    backend.hydrateFromPersistence(JSON.parse(raw));
    logger.info("state_hydrated", { bytes: raw.length });
  } catch (error) {
    logger.warn("state_hydrate_failed", { error: (error as Error)?.message });
  }
}

/**
 * Idempotent: starts hydration on the first call and shares the same promise
 * with every subsequent caller until it resolves. Concurrent cold-start
 * requests all await the same hydration before mutating game state, so a
 * later-arriving request can never run on the empty default while the Redis
 * fetch is still in flight.
 */
export function hydrateOnce(): Promise<void> {
  if (!globalRef.__cwHydratePromise) {
    globalRef.__cwHydratePromise = doHydrate();
  }
  return globalRef.__cwHydratePromise;
}

export async function save(): Promise<void> {
  if (!redis.isConfigured()) return;
  const backend = getBackend();
  if (!backend) return;

  try {
    const snapshot = backend.snapshotForPersistence();
    await redis.set(STATE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    logger.warn("state_save_failed", { error: (error as Error)?.message });
  }
}

/**
 * Schedule a save for after the current response has been delivered.
 * Always safe to call; no-ops when Redis is not configured.
 */
export function markDirty(): void {
  if (!redis.isConfigured()) return;

  try {
    after(() => save());
  } catch {
    // `after()` is only available inside a request scope. Fall back to a
    // best-effort fire-and-forget; the runtime may cut us off before completion.
    void save();
  }
}
