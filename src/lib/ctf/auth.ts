import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_COOKIE_NAME,
  isAuthEnabled,
  tokenFromCookieHeader,
  verifySessionToken,
} from "./session-token";

export {
  ACCESS_COOKIE_NAME,
  isAuthEnabled,
  issueSessionToken,
  sessionCookieOptions,
  verifyPassword,
  verifySessionToken,
} from "./session-token";

export async function isAuthenticated(): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  const store = await cookies();
  return verifySessionToken(store.get(ACCESS_COOKIE_NAME)?.value);
}

export async function requirePageAuth(): Promise<void> {
  if (!isAuthEnabled()) return;
  if (!(await isAuthenticated())) redirect("/ctf/login");
}

export function isRequestAuthenticated(request: Request): boolean {
  if (!isAuthEnabled()) return true;
  return verifySessionToken(tokenFromCookieHeader(request.headers.get("cookie")));
}

export function unauthorizedResponse(): Response {
  return Response.json(
    {
      error: "Akses ditolak. Login ke /ctf/login terlebih dahulu.",
      code: "UNAUTHORIZED",
    },
    { status: 401 },
  );
}

export function requireApiAuth(request: Request): Response | null {
  return isRequestAuthenticated(request) ? null : unauthorizedResponse();
}
