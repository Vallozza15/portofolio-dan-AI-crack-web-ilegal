import { isIP } from "node:net";
import { authorizePicoGymEndpoint } from "../picoctf/network";
import type { EndpointAuthorization } from "./types";

function positiveInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export const AUTONOMOUS_LIMITS = {
  maxIterations: positiveInt("CTF_AUTONOMOUS_MAX_ITERATIONS", 8, 1, 100),
  maxStrategies: positiveInt("CTF_AUTONOMOUS_MAX_STRATEGIES", 5, 1, 20),
  maxRepeatedCommands: positiveInt("CTF_AUTONOMOUS_MAX_REPEATED_COMMANDS", 0, 0, 10),
  maxVerificationAttempts: positiveInt("CTF_AUTONOMOUS_MAX_VERIFICATION_ATTEMPTS", 3, 1, 20),
  timeBudgetMs: positiveInt("CTF_AUTONOMOUS_TIME_BUDGET_MS", 600_000, 5_000, 3_600_000),
  commandTimeoutMs: positiveInt("CTF_AUTONOMOUS_COMMAND_TIMEOUT_MS", 20_000, 1_000, 120_000),
  maxOutputBytes: positiveInt("CTF_AUTONOMOUS_MAX_OUTPUT_BYTES", 64_000, 2_000, 1_000_000),
  maxDecodeDepth: positiveInt("CTF_AUTONOMOUS_MAX_DECODE_DEPTH", 4, 1, 10),
};

export const OPERATIONAL_MESSAGES = {
  id: {
    runningLocal: "Menjalankan tool Kali secara otomatis...",
    connecting: "Menghubungkan ke server CTF yang diotorisasi...",
    connected: "Koneksi terbentuk.",
    reading: "Membaca output terminal...",
    instructions: "Membaca instruksi challenge...",
    clue: "Petunjuk ditemukan. Memproses...",
    decoding: "Mencoba metode dekode yang sesuai...",
    intermediate: "Hasil antara ditemukan. Melanjutkan...",
    stage: "Tahap berikutnya terdeteksi. Melanjutkan otomatis...",
    verifying: "Memverifikasi kandidat flag...",
    completed: "Challenge selesai.",
    stopped: "Eksekusi otomatis dihentikan.",
    disconnected: "Koneksi remote ditutup.",
  },
  en: {
    runningLocal: "Running Kali tools automatically...",
    connecting: "Connecting to the authorized CTF server...",
    connected: "Connection established.",
    reading: "Reading terminal output...",
    instructions: "Reading challenge instructions...",
    clue: "Clue identified. Processing...",
    decoding: "Trying appropriate decoding methods...",
    intermediate: "Intermediate result found. Continuing...",
    stage: "Additional stage detected. Continuing automatically...",
    verifying: "Verifying flag candidate...",
    completed: "Challenge completed.",
    stopped: "Automated execution stopped.",
    disconnected: "Remote connection closed.",
  },
} as const;

export type OperationalKey = keyof typeof OPERATIONAL_MESSAGES.id;

export function operationalMessage(language: "id" | "en", key: OperationalKey): string {
  return OPERATIONAL_MESSAGES[language][key];
}

function normalizedHosts(): string[] {
  return (process.env.CTF_REMOTE_ALLOWED_HOSTS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function ipv4ToBigInt(value: string): bigint {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error("IPv4 tidak valid");
  }
  return parts.reduce((acc, part) => (acc << 8n) | BigInt(part), 0n);
}

function matchesCidr(host: string, rule: string): boolean {
  const [network, prefixRaw] = rule.split("/");
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  try {
    const value = ipv4ToBigInt(host);
    const base = ipv4ToBigInt(network);
    const mask = prefix === 0 ? 0n : (~0n << BigInt(32 - prefix)) & 0xffffffffn;
    return (value & mask) === (base & mask);
  } catch {
    return false;
  }
}

/**
 * Endpoint authorization. By default every well-formed host:port is allowed
 * (open mode), so newly published challenge ports work immediately without an
 * operator editing the allowlist. Set CTF_REMOTE_STRICT_ENDPOINTS=1 to restore
 * the explicit host/port allowlist behaviour.
 */
export function authorizeRemoteEndpoint(hostInput: string, portInput: number): EndpointAuthorization {
  const host = hostInput.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const port = Number(portInput);
  if (!host || host.length > 253 || /[\s/@\\]/.test(host)) {
    return { ok: false, reason: "Host remote tidak valid." };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: "Port remote tidak valid." };
  }
  const picoDecision = authorizePicoGymEndpoint(host, port);
  if (!picoDecision.ok) return picoDecision;
  if (process.env.CTF_REMOTE_STRICT_ENDPOINTS !== "1") {
    return { ok: true, reason: "Endpoint diizinkan (mode terbuka)." };
  }
  const allowedPorts = (process.env.CTF_REMOTE_ALLOWED_PORTS || "22")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0 && item < 65536);
  if (allowedPorts.length && !allowedPorts.includes(port)) {
    return { ok: false, reason: `Port ${port} tidak termasuk daftar yang diizinkan.` };
  }
  const rules = normalizedHosts();
  if (!rules.length) {
    return { ok: false, reason: "Belum ada host CTF remote yang diotorisasi operator." };
  }
  const ipVersion = isIP(host);
  for (const rule of rules) {
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(1);
      if (host.endsWith(suffix) && host !== suffix.slice(1)) {
        return { ok: true, reason: "Host cocok dengan aturan wildcard yang diotorisasi." };
      }
      continue;
    }
    if (rule.includes("/") && ipVersion === 4) {
      if (matchesCidr(host, rule)) {
        return { ok: true, reason: "Host cocok dengan rentang jaringan yang diotorisasi." };
      }
      continue;
    }
    if (rule === host) {
      return { ok: true, reason: "Host ada dalam daftar yang diotorisasi." };
    }
  }
  return { ok: false, reason: "Host tidak ada dalam daftar endpoint CTF yang diotorisasi." };
}

export function normalizeFingerprint(value: string): string {
  return value
    .trim()
    .replace(/^SHA256:/i, "")
    .replace(/^MD5:/i, "")
    .replace(/=+$/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}
