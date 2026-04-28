/**
 * Thin storage layer in front of the in-memory game state.
 *
 * The current implementation reads from / writes to module-level state in
 * `lib/game-store.ts`. This file isolates the *access pattern* so a future
 * implementation can swap to Redis / Postgres / SQLite by reimplementing
 * `load`, `save`, and `mutate` without touching `game-store.ts` callers.
 *
 * Today every operation is synchronous and in-process; the async signature
 * is intentional so callers don't need to change when persistence lands.
 */

import type { GameSnapshot } from "@/lib/types";

export interface GameStateBackend {
  /** Take a JSON-safe snapshot for persistence (no Buffers, no Maps). */
  snapshotForPersistence(): unknown;
  /** Replace the in-memory state from a previously persisted snapshot. */
  hydrateFromPersistence(payload: unknown): void;
  /** Public game snapshot for API consumers. */
  getSnapshot(walletAddress?: string | null): GameSnapshot;
}

const globalRef = globalThis as unknown as { __cwGameStateBackend?: GameStateBackend };

export function registerGameStateBackend(backend: GameStateBackend) {
  globalRef.__cwGameStateBackend = backend;
}

export function getBackend(): GameStateBackend | null {
  return globalRef.__cwGameStateBackend ?? null;
}

/**
 * Load persisted state if any. No-op until a real persistence driver is wired.
 * Safe to call from any route handler.
 */
export async function load(): Promise<void> {
  // Intentional no-op for the in-memory MVP. A future driver would:
  //   const raw = await redis.get("colorwars:state");
  //   if (raw) getBackend()?.hydrateFromPersistence(JSON.parse(raw));
}

/**
 * Persist current state. No-op until a real driver is wired.
 */
export async function save(): Promise<void> {
  // Intentional no-op for the in-memory MVP. A future driver would:
  //   const snap = getBackend()?.snapshotForPersistence();
  //   if (snap) await redis.set("colorwars:state", JSON.stringify(snap));
}

/**
 * Run a mutation against the state and persist when it returns.
 * Synchronous mutator + async persistence after.
 */
export async function mutate<T>(fn: () => T): Promise<T> {
  const result = fn();
  await save();
  return result;
}
