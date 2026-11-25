import { extractFlagCandidates } from "./flag";
import type { FlagCandidate } from "./types";

const INTERESTING = [
  "flag", "ctf", "password", "passwd", "secret", "token", "api_key", "apikey",
  "admin", "root", "login", "auth", "http://", "https://", "ftp://", "/bin/",
  "cmd.exe", "powershell", "eval(", "exec(", "system(", "base64", "BEGIN ",
  "PRIVATE KEY", "ssh-rsa", "SELECT ", "INSERT ", "UNION ", "secret_key",
  "hidden", "stego", "key=", "user=", "username", "email", "cookie", "session",
];

export interface StringExtraction {
  strings: string[];
  total: number;
  interesting: string[];
  flagCandidates: FlagCandidate[];
}

export function extractStrings(
  buffer: Buffer,
  options: { minLength?: number; maxStrings?: number; maxLength?: number } = {},
): StringExtraction {
  const minLength = options.minLength ?? 4;
  const maxStrings = options.maxStrings ?? 1200;
  const maxLength = options.maxLength ?? 320;
  const found = new Set<string>();
  const asciiRegex = new RegExp(`[\\x20-\\x7E]{${minLength},}`, "g");
  const latin = buffer.toString("latin1");
  for (const match of latin.matchAll(asciiRegex)) {
    if (found.size >= maxStrings) break;
    const value = match[0].slice(0, maxLength).trim();
    if (value.length >= minLength) found.add(value);
  }

  if (buffer.length >= minLength * 2) {
    const utf16 = buffer.toString("utf16le");
    const utf16Regex = new RegExp(`[\\x20-\\x7E]{${minLength},}`, "g");
    for (const match of utf16.matchAll(utf16Regex)) {
      if (found.size >= maxStrings) break;
      const value = match[0].slice(0, maxLength).trim();
      if (value.length >= minLength) found.add(value);
    }
  }

  const strings = [...found];
  const interesting = strings.filter((value) =>
    INTERESTING.some((keyword) => value.toLowerCase().includes(keyword.toLowerCase())),
  ).slice(0, 120);

  const flags = new Map<string, FlagCandidate>();
  for (const value of strings) {
    for (const candidate of extractFlagCandidates(value, "extracted string")) {
      if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
    }
  }

  return {
    strings,
    total: strings.length,
    interesting,
    flagCandidates: [...flags.values()],
  };
}

export function hexPreview(buffer: Buffer, maxBytes = 1024): string {
  const sample = buffer.subarray(0, Math.min(maxBytes, buffer.length));
  const lines: string[] = [];
  for (let offset = 0; offset < sample.length; offset += 16) {
    const row = sample.subarray(offset, offset + 16);
    const hex = [...row].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    const ascii = [...row].map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47, " ")}  |${ascii}|`);
  }
  if (buffer.length > sample.length) lines.push(`… ${buffer.length - sample.length} byte lagi tidak ditampilkan`);
  return lines.join("\n");
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function safePreview(text: string, limit = 4000) {
  return text.replace(/\u0000/g, "·").slice(0, limit);
}

export function isPrintableText(buffer: Buffer, threshold = 0.85) {
  if (!buffer.length) return false;
  const sample = buffer.subarray(0, 4096);
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) printable += 1;
  }
  return printable / sample.length >= threshold;
}

export function trailingDataAfter(buffer: Buffer, endOffset: number, label: string) {
  if (endOffset <= 0 || endOffset >= buffer.length) return null;
  const trailing = buffer.subarray(endOffset);
  return {
    label,
    offset: endOffset,
    length: trailing.length,
    preview: safePreview(trailing.toString("latin1"), 240),
    hex: hexPreview(trailing, 128),
    flagCandidates: extractFlagCandidates(trailing.toString("latin1"), `trailing bytes after ${label}`),
  };
}

export function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function toHex(value: number, width = 2) {
  return value.toString(16).padStart(width, "0");
}

export function sanitizeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() || "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "upload";
}
