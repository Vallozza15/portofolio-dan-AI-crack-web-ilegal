import { errorResponse, guard, noStoreJson } from "@/lib/ctf/api";
import {
  AuthorizedWebNavigator,
  FetchBrowserProvider,
  createBrowserProvider,
} from "@/lib/ctf/web/authorized-web-navigator";
import { PlatformAuthorizationError } from "@/lib/ctf/platforms/types";

export const runtime = "nodejs";

interface Body {
  url?: string;
  officialUrl?: string;
  authorized?: boolean;
  authorization?: "public" | "user-session";
  sessionCookie?: string;
  allowLocalEndpoints?: boolean;
  useBrowser?: boolean;
  timeoutMs?: number;
}

/**
 * Reads an authorized challenge page as untrusted data. It never executes
 * instructions found on the page and is limited to the official origin.
 */
export async function POST(request: Request) {
  const blocked = await guard(request, "web-read", 30);
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as Body;
    if (body.authorized !== true || !body.url || !body.officialUrl) {
      throw new PlatformAuthorizationError("Diperlukan authorized=true, url, dan officialUrl.");
    }
    const browser = body.useBrowser ? await createBrowserProvider() : null;
    const context = {
      authorized: true,
      authorization: body.authorization === "user-session" ? ("user-session" as const) : ("public" as const),
      ...(body.sessionCookie ? { sessionCookie: body.sessionCookie } : {}),
      ...(body.allowLocalEndpoints ? { allowLocalEndpoints: true } : {}),
      timeoutMs: Math.min(Math.max(body.timeoutMs || 15_000, 1_000), 30_000),
      maxBytes: 2_000_000,
    };
    const navigator = new AuthorizedWebNavigator(browser?.provider || new FetchBrowserProvider());
    const snapshot = await navigator.open(body.url, body.officialUrl, context);
    try {
      await navigator.close();
    } catch {
      // Closing a provider is best-effort; snapshot is still usable.
    }
    return noStoreJson({
      ...snapshot,
      provider: navigator.providerName,
      providerNote: browser?.note || "Provider fetch statis digunakan.",
    });
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) return errorResponse(error, 403);
    return errorResponse(error, 500);
  }
}
