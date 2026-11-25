import type { FlagCandidate, VerificationStatus } from "./types";

const KNOWN_PREFIXES = [
  "flag", "FLAG", "ctf", "CTF", "picoCTF", "PICOCTF", "HTB", "htb", "THM", "thm",
  "nite", "NITE", "DUCTF", "idek", "uiuctf", "buckeye", "corctf", "grey", "irisctf",
  "lactf", "maple", "patriotctf", "pingctf", "ptr", "sdctf", "sunshine", "swampctf",
  "utflag", "wctf", "wwf", "zer0pts", "pwn", "PWN", "shell", "SHELL", "hacktoday",
  "COMPFEST", "Gemastik", "CyberJawara", "LKS", "TCP1P", "tcp1p", "findit", "FindIT",
  "WRECKIT", "wreckit", "SPARK", "spark", "technofair", "TECHNOFAIR",
  "academy", "cyla", "CYLA",
];

const FLAG_REGEX = /(?:[A-Za-z][A-Za-z0-9_]{1,24})\{[^{}\r\n]{1,200}\}/g;

export function normalizeCustomFormat(customFormat?: string): RegExp | null {
  const raw = customFormat?.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("regex:")) return new RegExp(raw.slice(6), "gi");
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (raw.includes("{") && raw.includes("}")) {
      return new RegExp(escaped.replace(/\\\{[^}]*\\\}/, "\\{[^}\\r\\n]{1,300}\\}"), "g");
    }
    return new RegExp(`${escaped}\\{[^}\\r\\n]{1,300}\\}`, "g");
  } catch {
    return null;
  }
}

function confidenceFor(value: string, source: string, customFormat?: string) {
  const prefix = value.slice(0, value.indexOf("{"));
  let score = 0.55;
  if (KNOWN_PREFIXES.some((item) => item.toLowerCase() === prefix.toLowerCase())) score += 0.3;
  if (customFormat && value.toLowerCase().startsWith(customFormat.replace(/\{.*$/, "").toLowerCase())) score += 0.1;
  if (value.length >= 12 && value.length <= 160) score += 0.05;
  if (/decoded|lsb|exif|archive|pcap|string|metadata/i.test(source)) score += 0.05;
  return Math.min(0.99, Number(score.toFixed(2)));
}

const PLACEHOLDER_VALUES = new Set([
  "your_flag_here", "your-flag-here", "your flag here", "insert_flag_here",
  "flag_here", "flaghere", "example", "sample", "contoh", "placeholder",
  "redacted", "hidden", "unknown", "todo", "xxx", "xxxx", "xxxxx",
  "your_flag", "flag_value", "value_here", "isikan_disini", "masukkan_flag",
  "flag_disini", "flagdummy", "dummy", "test", "testing", "abc", "abc123",
]);

/** Format placeholders such as flag{...} are not real answers. */
function isPlaceholder(clean: string): boolean {
  const open = clean.indexOf("{");
  const close = clean.lastIndexOf("}");
  if (open < 1 || close <= open + 1) return true;
  const inner = clean.slice(open + 1, close).trim();
  if (!inner) return true;
  if (/^\.{2,}$/.test(inner)) return true;
  if (/^x{2,}$/i.test(inner)) return true;
  if (/^0{2,}$/.test(inner)) return true;
  if (PLACEHOLDER_VALUES.has(inner.toLowerCase())) return true;
  if (/^(your|insert|isikan|masukkan)[_\s-]*(flag|value|answer|jawaban)?(_\w+)?$/i.test(inner)) {
    return true;
  }
  if (/^(flag|example|sample|contoh|dummy|placeholder|redacted|unknown|todo)([_\s-]?(flag|value|here|disini|answer))?$/i.test(inner)) {
    return true;
  }
  return false;
}

function addCandidate(
  map: Map<string, FlagCandidate>,
  value: string,
  source: string,
  customFormat?: string,
  context?: string,
) {
  const clean = value.trim();
  if (!clean || clean.length < 5 || clean.length > 300) return;
  if (/\s{3,}/.test(clean)) return;
  if (isPlaceholder(clean)) return;
  const existing = map.get(clean);
  const confidence = confidenceFor(clean, source, customFormat);
  if (!existing || existing.confidence < confidence) {
    map.set(clean, {
      value: clean,
      format: clean.slice(0, clean.indexOf("{")),
      source,
      confidence,
      context: context?.slice(0, 240),
    });
  }
}

export function extractFlagCandidates(
  text: string,
  source = "text",
  customFormat?: string,
): FlagCandidate[] {
  const map = new Map<string, FlagCandidate>();
  if (!text) return [];
  const sample = text.slice(0, 2_000_000);

  for (const match of sample.matchAll(FLAG_REGEX)) {
    const value = match[0];
    const index = match.index || 0;
    addCandidate(map, value, source, customFormat, sample.slice(Math.max(0, index - 80), index + value.length + 80));
  }

  const custom = normalizeCustomFormat(customFormat);
  if (custom) {
    for (const match of sample.matchAll(custom)) {
      const value = match[0];
      const index = match.index || 0;
      addCandidate(map, value, `${source} (custom format)`, customFormat, sample.slice(Math.max(0, index - 80), index + value.length + 80));
    }
  }

  // A reversed flag is a common beginner challenge trick.
  const reversed = [...sample].reverse().join("");
  for (const match of reversed.matchAll(FLAG_REGEX)) {
    addCandidate(map, [...match[0]].reverse().join(""), `${source} (reversed)`, customFormat);
  }

  return [...map.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 40);
}

export function findFlagsInBuffer(
  buffer: Buffer,
  source = "raw bytes",
  customFormat?: string,
): FlagCandidate[] {
  const map = new Map<string, FlagCandidate>();
  const encodings: Array<[string, string]> = [
    ["ascii", buffer.toString("latin1")],
    ["utf8", buffer.toString("utf8")],
    ["utf16le", buffer.toString("utf16le")],
  ];
  for (const [encoding, text] of encodings) {
    if (!text) continue;
    for (const candidate of extractFlagCandidates(text, `${source} (${encoding})`, customFormat)) {
      addCandidate(map, candidate.value, candidate.source, customFormat, candidate.context);
    }
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 40);
}

export function determineStatus(
  candidates: FlagCandidate[],
  expectedFlag?: string,
): VerificationStatus {
  if (!candidates.length) return "UNSOLVED";
  if (expectedFlag) {
    const expected = expectedFlag.trim();
    if (candidates.some((candidate) => candidate.value === expected)) return "VERIFIED";
    return "INCOMPLETE";
  }
  const best = candidates[0];
  if (best.confidence >= 0.8) return "LIKELY";
  return "INCOMPLETE";
}

export function verifyAgainstExpected(
  candidate: string,
  expectedFlag: string,
): { matches: boolean; status: VerificationStatus; note: string } {
  const matches = candidate.trim() === expectedFlag.trim();
  return {
    matches,
    status: matches ? "VERIFIED" : "INCOMPLETE",
    note: matches
      ? "Kandidat cocok dengan expected flag yang Anda tetapkan pada challenge. Ini adalah verifikasi lokal, bukan verifikasi ke server CTF."
      : "Kandidat tidak cocok dengan expected flag. Periksa format, spasi, dan kapitalisasi.",
  };
}

export function flagFormatFromCandidates(candidates: FlagCandidate[], fallback = "flag{...}") {
  if (!candidates.length) return fallback;
  return `${candidates[0].format}{...}`;
}
