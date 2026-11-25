import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

export interface TlsInfo {
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  san?: string;
  serial?: string;
  fingerprint256?: string;
  authorized?: boolean;
  authorizationError?: string | null;
}

export interface HttpInspection {
  url: string;
  finalUrl: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyPreview: string;
  bodyBytes: number;
  bodyTruncated: boolean;
  durationMs: number;
  redirects: string[];
  tls?: TlsInfo;
  remoteAddress?: string;
  warnings: string[];
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowPrivate?: boolean;
  /** Text characters retained in bodyPreview; useful for bounded JSON APIs. */
  previewChars?: number;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv6Bytes(ip: string): number[] | null {
  let value = ip.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const v4 = ipv4ToInt(mapped[1]);
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, (v4 >>> 24) & 255, (v4 >>> 16) & 255, (v4 >>> 8) & 255, v4 & 255];
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const number = parseInt(group, 16);
    bytes.push((number >> 8) & 255, number & 255);
  }
  return bytes;
}

export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return PRIVATE_V4.some(([base, bits]) => inCidr4(address, base, bits));
  }
  if (family === 6) {
    const bytes = ipv6Bytes(address);
    if (!bytes) return true;
    if (bytes.every((byte) => byte === 0)) return true;
    if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return true;
    if ((bytes[0] & 0xfe) === 0xfc) return true;
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
    if (bytes[0] === 0xff) return true;
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true;
    if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
      return isPrivateAddress(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
    }
    return false;
  }
  return true;
}

export interface ResolvedTarget {
  hostname: string;
  address: string;
  family: number;
  all: Array<{ address: string; family: number }>;
}

export async function resolvePublicTarget(hostname: string, allowPrivate = false): Promise<ResolvedTarget> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (!allowPrivate && isPrivateAddress(host)) {
      throw new Error(`Alamat privat/loopback diblokir: ${host}. Aktifkan "allowPrivateHttp" hanya untuk lab lokal.`);
    }
    return { hostname: host, address: host, family: net.isIP(host), all: [{ address: host, family: net.isIP(host) }] };
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`DNS lookup gagal untuk ${host}.`);
  }
  if (!records.length) throw new Error(`Tidak ada alamat IP untuk ${host}.`);
  const blocked = records.filter((record) => isPrivateAddress(record.address));
  if (blocked.length && !allowPrivate) {
    throw new Error(`Host ${host} menuju alamat privat/loopback (${blocked.map((item) => item.address).join(", ")}). Diblokir untuk mencegah SSRF.`);
  }
  const chosen = records[0];
  return { hostname: host, address: chosen.address, family: chosen.family, all: records };
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) result[key] = value.join(", ");
    else if (value !== undefined) result[key] = String(value);
  }
  return result;
}

function certInfo(cert: tls.PeerCertificate): TlsInfo {
  const name = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value.join(", ") : value;
  return {
    subject: name(cert.subject?.CN) || JSON.stringify(cert.subject || {}),
    issuer: name(cert.issuer?.CN) || JSON.stringify(cert.issuer || {}),
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    san: cert.subjectaltname,
    serial: cert.serialNumber,
    fingerprint256: cert.fingerprint256,
  };
}

async function requestOnce(
  url: URL,
  options: Required<Pick<SafeFetchOptions, "method" | "timeoutMs" | "maxBytes" | "allowPrivate">> & {
    headers: Record<string, string>;
  },
): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  tls?: TlsInfo;
  remoteAddress?: string;
}> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Hanya protokol http:// dan https:// yang diizinkan.");
  }
  if (url.username || url.password) {
    throw new Error("URL dengan kredensial tertanam tidak diizinkan.");
  }
  const target = await resolvePublicTarget(url.hostname, options.allowPrivate);
  const transport = url.protocol === "https:" ? https : http;
  const requestHeaders: Record<string, string> = {
    "user-agent": "CTF-Intelligence/1.0 (authorized lab inspection)",
    accept: "*/*",
    ...options.headers,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: target.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers: requestHeaders,
        servername: url.protocol === "https:" ? target.hostname : undefined,
        lookup: ((_hostname: string, lookupOptions: unknown, callback: (...args: unknown[]) => void) => {
          const opts = lookupOptions as { all?: boolean } | number | undefined;
          const wantsAll = typeof opts === "object" && opts?.all;
          if (wantsAll) callback(null, [{ address: target.address, family: target.family }]);
          else callback(null, target.address, target.family);
        }) as never,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > options.maxBytes) {
            truncated = true;
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const socket = response.socket;
          let tlsInfo: TlsInfo | undefined;
          if (socket && "getPeerCertificate" in socket) {
            const tlsSocket = socket as tls.TLSSocket;
            const cert = tlsSocket.getPeerCertificate();
            if (cert && Object.keys(cert).length) {
              tlsInfo = {
                ...certInfo(cert),
                authorized: tlsSocket.authorized,
                authorizationError: tlsSocket.authorizationError ? String(tlsSocket.authorizationError) : null,
              };
            }
          }
          resolve({
            status: response.statusCode || 0,
            statusText: response.statusMessage || "",
            headers: normalizeHeaders(response.headers),
            body: Buffer.concat(chunks),
            truncated,
            tls: tlsInfo,
            remoteAddress: target.address,
          });
        });
        response.on("error", reject);
      },
    );
    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new Error(`Timeout setelah ${options.timeoutMs} ms.`));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<HttpInspection> {
  const start = Date.now();
  const method = options.method || "GET";
  const timeoutMs = Math.min(options.timeoutMs || 12_000, 30_000);
  const maxBytes = Math.min(options.maxBytes || 1_500_000, 4_000_000);
  const maxRedirects = Math.min(options.maxRedirects ?? 4, 8);
  const allowPrivate = Boolean(options.allowPrivate);
  const previewChars = Math.min(Math.max(options.previewChars || 20_000, 1_000), 500_000);
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new Error("URL tidak valid.");
  }
  const redirects: string[] = [];
  const warnings: string[] = [];

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const result = await requestOnce(current, {
      method,
      timeoutMs,
      maxBytes,
      allowPrivate,
      headers: options.headers || {},
    });
    const location = Array.isArray(result.headers.location)
      ? result.headers.location[0]
      : result.headers.location;
    if ([301, 302, 303, 307, 308].includes(result.status) && location) {
      if (hop === maxRedirects) throw new Error("Terlalu banyak redirect.");
      const next = new URL(location, current);
      redirects.push(next.toString());
      current = next;
      continue;
    }
    const contentType = result.headers["content-type"] || "";
    const textual = /text\/|json|xml|javascript|x-www-form-urlencoded|yaml|csv/i.test(contentType);
    const bodyPreview = textual
      ? result.body.toString("utf8").slice(0, previewChars)
      : `[binary ${result.body.length} byte, content-type ${contentType || "unknown"}]\n${result.body.subarray(0, 256).toString("hex")}`;
    if (allowPrivate) warnings.push("allowPrivateHttp aktif: permintaan ke jaringan privat diizinkan.");
    if (redirects.length) warnings.push(`Mengikuti ${redirects.length} redirect.`);
    return {
      url: rawUrl,
      finalUrl: current.toString(),
      method,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      bodyPreview,
      bodyBytes: result.body.length,
      bodyTruncated: result.truncated || result.body.length >= maxBytes,
      durationMs: Date.now() - start,
      redirects,
      tls: result.tls,
      remoteAddress: result.remoteAddress,
      warnings,
    };
  }
  throw new Error("Permintaan tidak selesai.");
}

export async function inspectTls(hostname: string, port = 443): Promise<TlsInfo & { address: string }> {
  const target = await resolvePublicTarget(hostname, false);
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: target.address,
        port,
        servername: target.hostname,
        rejectUnauthorized: false,
        timeout: 10_000,
      },
      () => {
        const cert = socket.getPeerCertificate(true);
        const info: TlsInfo & { address: string } = {
          address: target.address,
          ...(cert && Object.keys(cert).length ? certInfo(cert) : {}),
          authorized: socket.authorized,
          authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        };
        socket.end();
        resolve(info);
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS handshake timeout."));
    });
    socket.on("error", reject);
  });
}
