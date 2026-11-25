import { cookies } from "next/headers";
import {
  ACCESS_COOKIE_NAME,
  isAuthEnabled,
  issueSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/ctf/auth";
import { errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { checkRateLimit, clientKey, rateLimitResponse } from "@/lib/ctf/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = checkRateLimit(clientKey(request, "login"), 6, 60_000);
    if (!limited.ok) return rateLimitResponse(limited);
    if (!isAuthEnabled()) {
      return noStoreJson({ ok: true, note: "Autentikasi tidak diaktifkan (CTF_ACCESS_PASSWORD kosong)." });
    }
    const body = await readJson<{ password?: string }>(request);
    if (!verifyPassword(body.password || "")) {
      return noStoreJson({ error: "Password salah." }, { status: 401 });
    }
    const { token, expiresAt } = issueSessionToken();
    const store = await cookies();
    store.set({ ...sessionCookieOptions(expiresAt), value: token });
    return noStoreJson({ ok: true, expiresAt });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE() {
  const store = await cookies();
  store.set({
    name: ACCESS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return noStoreJson({ ok: true });
}
