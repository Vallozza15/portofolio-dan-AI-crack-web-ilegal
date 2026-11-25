import { isIP } from "node:net";
import { PlatformAuthorizationError, type PlatformRequestContext } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2_000_000;

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

/** Enforce an exact official-origin boundary before any request leaves the process. */
export function assertAuthorizedUrl(
  rawUrl: string,
  officialUrl: string,
  context: Pick<PlatformRequestContext, "authorized" | "allowLocalEndpoints">,
): URL {
  if (!context.authorized) {
    throw new PlatformAuthorizationError("Akses platform tidak diberikan oleh operator.");
  }
  let url: URL;
  let official: URL;
  try {
    url = new URL(rawUrl);
    official = new URL(officialUrl);
  } catch {
    throw new PlatformAuthorizationError("URL platform tidak valid.");
  }
  if (url.username || url.password) {
    throw new PlatformAuthorizationError("Kredensial tidak boleh ditaruh di URL.");
  }
  const host = normalizedHost(url.hostname);
  const officialHost = normalizedHost(official.hostname);
  const officialMatch = host === officialHost || host.endsWith(`.${officialHost}`);
  const localAllowed = Boolean(context.allowLocalEndpoints) && isLoopbackHost(host);
  if (!officialMatch && !localAllowed) {
    throw new PlatformAuthorizationError(`Host ${host} bukan origin resmi ${officialHost}.`);
  }
  if (isIP(host) && !localAllowed) {
    throw new PlatformAuthorizationError("Alamat IP langsung tidak diizinkan untuk platform publik.");
  }
  if (isPrivateIpv4(host) && !localAllowed) {
    throw new PlatformAuthorizationError("Alamat private tidak diizinkan untuk platform publik.");
  }
  if (url.protocol !== "https:" && !localAllowed) {
    throw new PlatformAuthorizationError("Hanya HTTPS yang diizinkan untuk platform publik.");
  }
  return url;
}

export interface AuthorizedResponse {
  url: string;
  status: number;
  contentType: string;
  text: string;
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new PlatformAuthorizationError("Respons melebihi batas ukuran.");
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new PlatformAuthorizationError("Respons melebihi batas ukuran.");
    chunks.push(chunk);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function authorizedFetch(
  rawUrl: string,
  officialUrl: string,
  context: PlatformRequestContext,
  init: RequestInit = {},
): Promise<AuthorizedResponse> {
  const url = assertAuthorizedUrl(rawUrl, officialUrl, context);
  const headers = new Headers(init.headers || {});
  headers.set("user-agent", "ctf-intelligence/authorized-discovery");
  if (context.token) headers.set("authorization", `Bearer ${context.token}`);
  if (context.sessionCookie) headers.set("cookie", context.sessionCookie);
  const response = await (context.fetcher || fetch)(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(context.timeoutMs || DEFAULT_TIMEOUT_MS),
    redirect: "error",
    cache: "no-store",
  });
  const bytes = await readLimited(response, context.maxBytes || DEFAULT_MAX_BYTES);
  return {
    url: url.toString(),
    status: response.status,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    text: new TextDecoder().decode(bytes),
  };
}

export async function authorizedFetchBytes(
  rawUrl: string,
  officialUrl: string,
  context: PlatformRequestContext,
): Promise<{ url: string; contentType: string; bytes: Uint8Array }> {
  const url = assertAuthorizedUrl(rawUrl, officialUrl, context);
  const headers = new Headers({ "user-agent": "ctf-intelligence/authorized-download" });
  if (context.token) headers.set("authorization", `Bearer ${context.token}`);
  if (context.sessionCookie) headers.set("cookie", context.sessionCookie);
  const response = await (context.fetcher || fetch)(url, {
    headers,
    signal: AbortSignal.timeout(context.timeoutMs || DEFAULT_TIMEOUT_MS),
    redirect: "error",
    cache: "no-store",
  });
  const bytes = await readLimited(response, context.maxBytes || DEFAULT_MAX_BYTES);
  return { url: url.toString(), contentType: response.headers.get("content-type") || "application/octet-stream", bytes };
}
