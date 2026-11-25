import { createHmac, timingSafeEqual } from "node:crypto";

/** Pure session-token helpers shared by HTTP routes and the WebSocket server. */
export const ACCESS_COOKIE_NAME = "ctf_access";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function isAuthEnabled(): boolean {
  return Boolean(process.env.CTF_ACCESS_PASSWORD && process.env.CTF_ACCESS_PASSWORD.length > 0);
}

function signingSecret(): string {
  return [
    process.env.CTF_ACCESS_PASSWORD || "auth-disabled",
    process.env.CTF_MASTER_KEY || "local-master-key",
    "ctf-intelligence-access-v1",
  ].join("|");
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.CTF_ACCESS_PASSWORD || "";
  if (!expected) return true;
  return safeEqual(input, expected);
}

export function issueSessionToken(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (!/^\d+$/.test(expires)) return false;
  if (Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    name: ACCESS_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}

/** Reads the auth cookie from a raw Cookie header (also used during WS upgrade). */
export function tokenFromCookieHeader(header: string | undefined | null): string | undefined {
  for (const part of (header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === ACCESS_COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
