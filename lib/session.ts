import { createHmac, timingSafeEqual } from "node:crypto";

import type { TeamColor } from "@/lib/types";

export const SESSION_COOKIE = "cw_sid";
export const SESSION_TTL_MS = 60 * 60 * 1000;

function getSecret(): string {
  const raw = process.env.SESSION_SECRET;
  if (raw) return raw;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production. Generate one with `openssl rand -hex 32` and add it to your environment.",
    );
  }
  return "dev-only-color-wars-session-secret-do-not-use-in-prod";
}

export type SessionPayload = {
  wallet: string;
  color: TeamColor;
  exp: number;
};

function base64urlEncode(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function sign(body: string) {
  return base64urlEncode(createHmac("sha256", getSecret()).update(body).digest());
}

export function issueSession(payload: Omit<SessionPayload, "exp">): { token: string; cookie: string; exp: number } {
  const exp = Date.now() + SESSION_TTL_MS;
  const body = base64urlEncode(JSON.stringify({ ...payload, wallet: payload.wallet.toLowerCase(), exp }));
  const sig = sign(body);
  const token = `${body}.${sig}`;
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const isProd = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
    `Max-Age=${maxAgeSec}`,
  ]
    .filter(Boolean)
    .join("; ");
  return { token, cookie, exp };
}

export function clearSessionCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(body).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.wallet !== "string" || typeof payload.exp !== "number") return null;
  if (typeof payload.color !== "string") return null;
  if (Date.now() >= payload.exp) return null;
  return payload;
}
