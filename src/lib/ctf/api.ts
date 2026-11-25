import { requireApiAuth } from "./auth";
import { checkRateLimit, clientKey, rateLimitResponse, sweepRateLimits } from "./rate-limit";

export async function guard(
  request: Request,
  scope: string,
  limit = 90,
  windowMs = 60_000,
): Promise<Response | null> {
  const auth = requireApiAuth(request);
  if (auth) return auth;
  sweepRateLimits();
  const result = checkRateLimit(clientKey(request, scope), limit, windowMs);
  if (!result.ok) return rateLimitResponse(result);
  return null;
}

export function errorResponse(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json(
    { error: message.slice(0, 1200), code: status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST" },
    { status },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Body JSON tidak valid.");
  }
}

export function noStoreJson(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { ...init, headers });
}
