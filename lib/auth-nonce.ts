import { randomBytes } from "node:crypto";

const NONCE_TTL_MS = 5 * 60 * 1000;

type NonceEntry = { nonce: string; expiresAt: number };

const globalRef = globalThis as unknown as { __cwAuthNonces?: Map<string, NonceEntry> };
if (!globalRef.__cwAuthNonces) {
  globalRef.__cwAuthNonces = new Map<string, NonceEntry>();
}
const store = globalRef.__cwAuthNonces;

function key(wallet: string) {
  return wallet.trim().toLowerCase();
}

function prune(now: number) {
  for (const [k, entry] of store) {
    if (entry.expiresAt <= now) store.delete(k);
  }
}

export function issueNonce(wallet: string): string {
  const now = Date.now();
  prune(now);
  const nonce = randomBytes(16).toString("hex");
  store.set(key(wallet), { nonce, expiresAt: now + NONCE_TTL_MS });
  return nonce;
}

export function consumeNonce(wallet: string, nonce: string): boolean {
  const now = Date.now();
  prune(now);
  const k = key(wallet);
  const entry = store.get(k);
  if (!entry) return false;
  if (entry.expiresAt <= now) {
    store.delete(k);
    return false;
  }
  if (entry.nonce !== nonce) return false;
  store.delete(k);
  return true;
}
