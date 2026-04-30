/**
 * Persistence wiring for the in-memory game store.
 *
 * Why this is shaped the way it is:
 * Each Vercel API request can land in a fresh lambda. In-memory state is
 * discarded on cold start and two concurrent lambdas can't share writes via
 * memory. We need:
 *   1. A way to load the latest known state at the top of every handler
 *      (`refreshFromPersistence`) so we never act on stale memory.
 *   2. A way to save state back after a mutation that doesn't get clobbered
 *      by an older lambda's slow save (`save` via Lua CAS on a version
 *      counter).
 *   3. A way to coalesce many quick mutations inside a single lambda into one
 *      network round-trip (`markDirty` debounce).
 *
 * If Redis is not configured the store falls back to pure in-memory mode —
 * fine for local dev, not for production.
 */

import { after } from "next/server";

import { logger } from "@/lib/logger";
import { redis } from "@/lib/store/redis";
import { getBackend } from "@/lib/game-state";

const STATE_KEY = "colorwars:state:v1";
const VERSION_KEY = "colorwars:state:v1:version";

type GlobalShape = {
  __cwHydratePromise?: Promise<void>;
  __cwLocalVersion?: number;
  __cwSaveInflight?: Promise<void>;
  __cwSavePending?: boolean;
  __cwSaveTimer?: NodeJS.Timeout | null;
};
const globalRef = globalThis as unknown as GlobalShape;

const SAVE_DEBOUNCE_MS = 80;

function localVersion(): number {
  return globalRef.__cwLocalVersion ?? 0;
}

function setLocalVersion(version: number): void {
  globalRef.__cwLocalVersion = version;
}

export function isHydrated(): boolean {
  return Boolean(globalRef.__cwHydratePromise);
}

async function loadFromRedis(): Promise<number> {
  const backend = getBackend();
  if (!backend) return 0;

  // Atomic read of both the state payload and the version counter in a single
  // Lua call so a concurrent save can't slip a version bump in between (which
  // would set localVersion to N+1 while in-memory state is still version N).
  const { state, version } = await redis.getStateAndVersion(STATE_KEY, VERSION_KEY);
  if (!state) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(state);
  } catch (error) {
    logger.warn("state_parse_failed", { error: (error as Error)?.message });
    return 0;
  }

  backend.hydrateFromPersistence(parsed);
  setLocalVersion(version);
  logger.info("state_hydrated", { bytes: state.length, version });
  return version;
}

async function doHydrate(): Promise<void> {
  if (!redis.isConfigured()) return;
  try {
    await loadFromRedis();
  } catch (error) {
    logger.warn("state_hydrate_failed", { error: (error as Error)?.message });
  }
}

/**
 * Idempotent: starts hydration on the first call and shares the same promise
 * with every subsequent caller. Concurrent cold-start requests all await the
 * same hydration before mutating game state, so a later-arriving request can
 * never operate on the empty default while the Redis fetch is in flight.
 */
export function hydrateOnce(): Promise<void> {
  if (!globalRef.__cwHydratePromise) {
    globalRef.__cwHydratePromise = doHydrate();
  }
  return globalRef.__cwHydratePromise;
}

/**
 * Cheap staleness check + reload. Reads the current version counter from Redis
 * (one round-trip, ~10 bytes). If it's newer than what this lambda last
 * persisted/loaded, do a full state reload. Used at the top of read handlers
 * (`/api/game/state`) so polling clients always see the freshest state even
 * when their request lands on a lambda that hasn't seen recent mutations.
 */
export async function refreshFromPersistence(): Promise<void> {
  await hydrateOnce();
  if (!redis.isConfigured()) return;

  try {
    const remoteVersion = (await redis.getNumber(VERSION_KEY)) ?? 0;
    if (remoteVersion > localVersion()) {
      await loadFromRedis();
    }
  } catch (error) {
    logger.warn("state_refresh_failed", { error: (error as Error)?.message });
  }
}

async function performSave(): Promise<void> {
  const backend = getBackend();
  if (!backend) return;

  const snapshot = backend.snapshotForPersistence();
  const nextVersion = localVersion() + 1;
  const payload = JSON.stringify(snapshot);

  try {
    const stored = await redis.setIfNewer(STATE_KEY, VERSION_KEY, payload, nextVersion);
    setLocalVersion(stored);
    if (stored > nextVersion) {
      // A concurrent lambda persisted a newer state while we were preparing
      // this save. Re-load it so the next mutation in this lambda starts from
      // the freshest snapshot.
      await loadFromRedis();
    }
  } catch (error) {
    logger.warn("state_save_failed", { error: (error as Error)?.message });
  }
}

/**
 * Coalesces concurrent saves: while one save is in flight, additional calls
 * just set a "pending" flag. When the in-flight save resolves, if pending was
 * set, runs one more save with the latest snapshot. Multiple rapid mutations
 * inside the same lambda therefore result in 1–2 Redis writes instead of N.
 */
export async function save(): Promise<void> {
  if (!redis.isConfigured()) return;

  if (globalRef.__cwSaveInflight) {
    globalRef.__cwSavePending = true;
    return globalRef.__cwSaveInflight;
  }

  const inflight = (async () => {
    try {
      await performSave();
      while (globalRef.__cwSavePending) {
        globalRef.__cwSavePending = false;
        await performSave();
      }
    } finally {
      globalRef.__cwSaveInflight = undefined;
    }
  })();
  globalRef.__cwSaveInflight = inflight;
  return inflight;
}

/**
 * Schedule a save after the current response has been delivered. Multiple
 * `markDirty()` calls within the same lambda are debounced into a single
 * save, so a flurry of paints generates one Redis write instead of many.
 */
export function markDirty(): void {
  if (!redis.isConfigured()) return;

  const flush = (): void => {
    globalRef.__cwSaveTimer = null;
    void save();
  };

  if (globalRef.__cwSaveTimer) {
    clearTimeout(globalRef.__cwSaveTimer);
  }
  globalRef.__cwSaveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);

  try {
    after(async () => {
      // After the response flushes, force the timer to fire immediately so we
      // don't lose pending saves if the lambda is about to be frozen.
      if (globalRef.__cwSaveTimer) {
        clearTimeout(globalRef.__cwSaveTimer);
        globalRef.__cwSaveTimer = null;
      }
      await save();
    });
  } catch {
    // `after()` only available inside a request scope. The setTimeout fallback
    // will run on its own; if the lambda is killed before then, the save is
    // best-effort lost — which the per-key version counter will surface to the
    // next request as an out-of-date local version.
  }
}
