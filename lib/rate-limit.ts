type Bucket = { tokens: number; lastRefill: number };

const globalRef = globalThis as unknown as {
  __cwTokenBuckets?: Map<string, Bucket>;
  __cwSlidingWindows?: Map<string, number[]>;
};

if (!globalRef.__cwTokenBuckets) globalRef.__cwTokenBuckets = new Map();
if (!globalRef.__cwSlidingWindows) globalRef.__cwSlidingWindows = new Map();

const buckets = globalRef.__cwTokenBuckets;
const windows = globalRef.__cwSlidingWindows;

export function consumeToken(key: string, capacity: number, refillPerSec: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

export function checkSlidingWindow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    windows.set(key, list);
    return false;
  }
  list.push(now);
  windows.set(key, list);
  return true;
}
