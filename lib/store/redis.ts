/**
 * Minimal Upstash-compatible Redis REST client.
 *
 * Works with both Upstash (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
 * and Vercel KV (KV_REST_API_URL / KV_REST_API_TOKEN) — they share the same
 * REST protocol.
 *
 * No external dependency; uses global `fetch`.
 */

import { logger } from "@/lib/logger";

type RedisConfig = { url: string; token: string };

function readConfig(): RedisConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? null;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? null;

  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function command(args: (string | number)[]): Promise<unknown> {
  const config = readConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.warn("redis_command_failed", { status: response.status, text: text.slice(0, 200) });
    throw new Error(`Redis command failed: ${response.status}`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) {
    logger.warn("redis_command_error", { error: payload.error });
    throw new Error(payload.error);
  }
  return payload.result ?? null;
}

export const redis = {
  isConfigured(): boolean {
    return readConfig() !== null;
  },

  async get(key: string): Promise<string | null> {
    const result = await command(["GET", key]);
    return typeof result === "string" ? result : null;
  },

  async set(key: string, value: string): Promise<void> {
    await command(["SET", key, value]);
  },

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await command(["SET", key, value, "EX", ttlSeconds]);
  },

  async del(key: string): Promise<void> {
    await command(["DEL", key]);
  },

  /**
   * Atomic compare-and-delete: returns true if value matched and key was deleted.
   * Implemented via Lua to avoid a race between GET and DEL.
   */
  async getAndDel(key: string): Promise<string | null> {
    const result = await command([
      "EVAL",
      "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]); end; return v;",
      1,
      key,
    ]);
    return typeof result === "string" ? result : null;
  },

  /**
   * Atomic compare-and-swap save: writes `payload` to `stateKey` and `nextVersion`
   * to `versionKey` only if the version stored in Redis is strictly less than
   * `nextVersion`. Returns the version that ended up stored. This prevents an
   * older lambda's save from overwriting a newer lambda's state.
   */
  async setIfNewer(
    stateKey: string,
    versionKey: string,
    payload: string,
    nextVersion: number,
  ): Promise<number> {
    const result = await command([
      "EVAL",
      "local cur=tonumber(redis.call('GET',KEYS[2])) or 0; if cur >= tonumber(ARGV[2]) then return cur; end; redis.call('SET',KEYS[1],ARGV[1]); redis.call('SET',KEYS[2],ARGV[2]); return tonumber(ARGV[2]);",
      2,
      stateKey,
      versionKey,
      payload,
      String(nextVersion),
    ]);
    return typeof result === "number" ? result : 0;
  },

  async getNumber(key: string): Promise<number | null> {
    const result = await command(["GET", key]);
    if (typeof result !== "string") return null;
    const parsed = Number(result);
    return Number.isFinite(parsed) ? parsed : null;
  },

  /**
   * Atomically read both keys in a single Lua call. Returns `[state, version]`.
   * Used for hydration to avoid the race where state is read at version N and
   * the version counter is then read at version N+1 (a concurrent save snuck
   * in between).
   */
  async getStateAndVersion(
    stateKey: string,
    versionKey: string,
  ): Promise<{ state: string | null; version: number }> {
    const result = await command([
      "EVAL",
      "return {redis.call('GET',KEYS[1]), redis.call('GET',KEYS[2])};",
      2,
      stateKey,
      versionKey,
    ]);
    if (!Array.isArray(result)) return { state: null, version: 0 };
    const [rawState, rawVersion] = result as [unknown, unknown];
    const version =
      typeof rawVersion === "string" && Number.isFinite(Number(rawVersion))
        ? Number(rawVersion)
        : 0;
    return {
      state: typeof rawState === "string" ? rawState : null,
      version,
    };
  },

  /**
   * Atomic claim of a one-shot key. Returns true if the key was just created
   * (i.e. the caller is the first to claim it), false if another caller had
   * already claimed it. Used to dedupe on-chain transaction hashes across
   * lambda instances.
   */
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await command([
      "SET",
      key,
      "1",
      "NX",
      "EX",
      String(ttlSeconds),
    ]);
    return result === "OK";
  },
};
