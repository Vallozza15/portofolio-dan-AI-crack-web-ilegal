import {
  atbash,
  autoDecodeLayers,
  base32Decode,
  base58Decode,
  base64Decode,
  binaryDecode,
  caesarBruteforce,
  decimalDecode,
  detectEncodings,
  englishScore,
  hexDecode,
  htmlDecode,
  morseDecode,
  rot47,
  unicodeUnescape,
  urlDecode,
  vigenere,
  xorSingleBruteforce,
} from "../crypto";
import { AUTONOMOUS_LIMITS } from "./config";
import type { DecodingAttempt } from "./types";

const FLAG_RE = /[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\r\n]{1,200}\}/;
const STANDALONE_FLAG_RE = /^([A-Za-z][A-Za-z0-9_]{1,24})\{[^}\r\n]{1,200}\}$/;
const KNOWN_FLAG_PREFIXES = new Set([
  "flag", "ctf", "picoctf", "htb", "thm", "nite", "ductf", "idek", "uiuctf",
  "corctf", "lactf", "maple", "pwn", "shell", "hacktoday", "compfest",
  "gemastik", "cyberjawara", "lks", "tcp1p", "findit", "wreckit", "spark",
]);
const INSTRUCTION_RE = /\b(instruction|instruksi|readme|please|silakan|follow|ikuti|next|langkah|hint|petunjuk|flag|password|key|secret|decode|dekode|step)\b/i;
const MEANINGFUL_RE = /\b(the|and|flag|ctf|this|is|you|not|with|for|ini|itu|adalah|untuk|find|found|key|secret|step)\b/i;

const METHOD_HINTS: Array<{ names: string[]; pattern: RegExp }> = [
  { names: ["base64"], pattern: /\bbase\s*64\b/i },
  { names: ["base32"], pattern: /\bbase\s*32\b/i },
  { names: ["base58"], pattern: /\bbase\s*58\b/i },
  { names: ["hex"], pattern: /\bhex|heksadesimal/i },
  { names: ["binary"], pattern: /\bbinary|biner/i },
  { names: ["rot13"], pattern: /\brot\s*13\b/i },
  { names: ["rot47"], pattern: /\brot\s*47\b/i },
  { names: ["caesar", "atbash"], pattern: /\bcaesar|shift|geser|substitusi/i },
  { names: ["xor"], pattern: /\bxor\b/i },
  { names: ["vigenere"], pattern: /\bvigen[eè]re/i },
  { names: ["morse"], pattern: /\bmorse/i },
  { names: ["decimal", "ascii_decimal"], pattern: /\bascii|decimal|desimal|comma|koma/i },
  { names: ["url"], pattern: /\burl|percent|persen/i },
  { names: ["html"], pattern: /\bhtml|entit/i },
  { names: ["unicode"], pattern: /\bunicode|escape/i },
];

function printableRatio(text: string): number {
  if (!text) return 0;
  const printable = [...text].filter((char) => /[\x09\x0a\x0d\x20-\x7e\u00a0-\u024f]/.test(char)).length;
  return printable / text.length;
}

function isMostlyPrintable(text: string): boolean {
  return text.length > 0 && printableRatio(text) >= 0.8;
}

function isFlagLike(text: string): boolean {
  return FLAG_RE.test(text);
}

function isStandaloneFlag(text: string): boolean {
  const match = STANDALONE_FLAG_RE.exec(text.trim());
  return match ? KNOWN_FLAG_PREFIXES.has(match[1].toLowerCase()) : false;
}

function scoreValue(value: string, method: string, hint: string): number {
  if (!value || value.length > 20_000) return -10;
  let score = 0;
  const ratio = printableRatio(value);
  score += ratio * 3;
  if (ratio < 0.7) score -= 3;
  if (/[\uFFFD\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) score -= 2;

  const english = englishScore(value);
  if (english > 0) score += Math.min(2, english * 2);
  if (MEANINGFUL_RE.test(value)) score += 1.5;
  if (INSTRUCTION_RE.test(value)) score += 4;
  if (FLAG_RE.test(value)) score += 14;

  if (hint) {
    const lowerHint = hint.toLowerCase();
    const lowerMethod = method.toLowerCase();
    for (const { names, pattern } of METHOD_HINTS) {
      if (pattern.test(hint) && names.some((name) => lowerMethod.includes(name))) score += 7;
      if (new RegExp(`\\b(?:not|bukan|tidak)\\s+${pattern.source.replace(/^\^|\\b|\\b$/g, "")}`, "i").test(lowerHint) && names.some((name) => lowerMethod.includes(name))) {
        score -= 10;
      }
    }
  }

  return Number(score.toFixed(3));
}

interface RawAttempt {
  method: string;
  value: string;
  evidence: string;
}

function dedupeByValue(attempts: DecodingAttempt[]): DecodingAttempt[] {
  const map = new Map<string, DecodingAttempt>();
  for (const attempt of attempts) {
    const existing = map.get(attempt.value);
    if (!existing || attempt.score > existing.score) map.set(attempt.value, attempt);
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.method.localeCompare(b.method));
}

function extractVigenereKey(hint: string): string | undefined {
  const match = /(?:key|kunci|keyword)\s*[:=]?\s*["']?([A-Za-z]{1,32})/i.exec(hint || "");
  return match?.[1];
}

export class EncodingDetectionEngine {
  /** Reports plausible single-layer decodings with evidence, without claiming certainty. */
  detect(text: string): DecodingAttempt[] {
    return this.attemptsFor(text, "");
  }

  /** Recursively peels supported layers up to maxDepth and returns ranked attempts. */
  decode(text: string, hint = "", maxDepth = AUTONOMOUS_LIMITS.maxDecodeDepth): DecodingAttempt[] {
    const depth = Math.max(1, Math.min(10, Math.floor(Number(maxDepth) || AUTONOMOUS_LIMITS.maxDecodeDepth)));
    const results: DecodingAttempt[] = [];
    const seen = new Set<string>([text]);
    type Node = { value: string; path: string[]; score: number };
    let frontier: Node[] = [{ value: text, path: [], score: 0 }];

    for (let level = 0; level < depth && frontier.length; level += 1) {
      const next: Node[] = [];
      for (const node of frontier) {
        for (const attempt of this.attemptsFor(node.value, hint)) {
          if (!attempt.value || attempt.value === node.value || seen.has(attempt.value)) continue;
          seen.add(attempt.value);
          const expanded: DecodingAttempt = {
            ...attempt,
            path: [...node.path, ...attempt.path],
          };
          results.push(expanded);
          if (!isFlagLike(attempt.value) && attempt.score >= 1.5) {
            next.push({ value: attempt.value, path: expanded.path, score: attempt.score });
          }
        }
      }
      frontier = next.sort((a, b) => b.score - a.score).slice(0, 6);
    }

    return dedupeByValue(results);
  }

  private attemptsFor(text: string, hint: string): DecodingAttempt[] {
    const attempts = this.rawAttempts(text, hint).map((attempt) => ({
      method: attempt.method,
      value: attempt.value,
      path: [attempt.method],
      score: scoreValue(attempt.value, attempt.method, hint),
      evidence: attempt.evidence,
    }));
    return dedupeByValue(attempts);
  }

  private rawAttempts(text: string, hint: string): RawAttempt[] {
    const attempts: RawAttempt[] = [];
    const value = text.trim();
    if (!value) return attempts;

    const add = (method: string, decoded: string, evidence: string) => {
      if (decoded && decoded !== value && isMostlyPrintable(decoded)) {
        attempts.push({ method, value: decoded, evidence });
      }
    };
    const tryDecode = (method: string, evidence: string, run: () => string) => {
      try {
        add(method, run(), evidence);
      } catch {
        // Speculative encoding detection is expected to fail for ambiguous input.
      }
    };

    const findings = detectEncodings(value);
    const findingFor = (type: string) => findings.find((finding) => finding.type.toLowerCase().includes(type.toLowerCase()));
    const evidenceFor = (type: string, fallback: string) => {
      const finding = findingFor(type);
      return finding ? `${finding.type}: ${finding.reason}` : fallback;
    };

    const base64Like = value.replace(/\s/g, "");
    if (/^[A-Za-z0-9+/=]+$/.test(base64Like) && base64Like.length >= 8 && base64Like.length % 4 === 0) {
      tryDecode("base64_decode", evidenceFor("Base64", "Panjang Base64 kelipatan 4."), () => base64Decode(value));
    }
    if (/^[A-Za-z0-9_-]+$/.test(base64Like) && base64Like.length >= 8 && base64Like.length % 4 === 0) {
      tryDecode("base64url_decode", "Alfabet Base64URL (- dan _).", () => base64Decode(value, true));
    }
    if (/^[A-Z2-7=\s]{8,}$/.test(value)) {
      tryDecode("base32_decode", evidenceFor("Base32", "Hanya alfabet Base32."), () => base32Decode(value));
    }
    if (/^[1-9A-HJ-NP-Za-km-z]{8,}$/.test(value)) {
      tryDecode("base58_decode", evidenceFor("Base58", "Alfabet Base58 tanpa karakter ambigu."), () => base58Decode(value));
    }
    if (/^(?:0x)?[0-9a-fA-F][0-9a-fA-F\s:]{5,}$/.test(value) && value.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "").length % 2 === 0) {
      tryDecode("hex_decode", evidenceFor("Hexadecimal", "Pasangan digit heksadesimal."), () => hexDecode(value));
    }
    if (/^[01\s]{8,}$/.test(value) && value.replace(/\s/g, "").length % 8 === 0) {
      tryDecode("binary_decode", evidenceFor("Binary", "Bit 0/1 kelipatan 8."), () => binaryDecode(value));
    }
    const decimalParts = value.split(/[\s,]+/).filter(Boolean);
    if (decimalParts.length >= 4 && decimalParts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
      tryDecode("ascii_decimal_decode", "Deretan desimal ASCII yang dipisah spasi atau koma.", () => decimalDecode(value));
    }
    if (/%[0-9A-Fa-f]{2}/.test(value)) {
      tryDecode("url_decode", evidenceFor("URL", "Mengandung escape %XX."), () => urlDecode(value));
    }
    if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value)) {
      tryDecode("html_decode", evidenceFor("HTML", "Mengandung entitas HTML."), () => htmlDecode(value));
    }
    if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}/i.test(value)) {
      tryDecode("unicode_unescape", evidenceFor("Escape", "Mengandung \\uXXXX atau \\xXX."), () => unicodeUnescape(value));
    }
    if (/^[.\-/\s]+$/.test(value) && /[.-]/.test(value) && value.length >= 5) {
      tryDecode("morse_decode", evidenceFor("Morse", "Hanya titik, garis, dan pemisah."), () => morseDecode(value));
    }

    if (!isStandaloneFlag(value)) {
      if (/[A-Za-z]/.test(value)) {
        for (const candidate of caesarBruteforce(value)) {
          if (candidate.shift === 0) continue;
          const method = candidate.shift === 13 ? "rot13" : `caesar_shift:${candidate.shift}`;
          add(method, candidate.output, `Pergeseran Caesar ${candidate.shift}; skor frekuensi ${candidate.score.toFixed(2)}.`);
        }
        add("atbash", atbash(value), "Substitusi Atbash (A↔Z).");
      }
      if (/[!-~]/.test(value)) {
        add("rot47", rot47(value), "ROT47 pada rentang ASCII 33–126.");
      }

      if (value.length >= 4) {
        const encodings: Array<"text" | "hex"> = [];
        if (/^[0-9a-fA-F\s]+$/.test(value) && value.replace(/\s/g, "").length % 2 === 0) encodings.push("hex");
        encodings.push("text");
        const seenXor = new Set<string>();
        for (const encoding of encodings) {
          for (const candidate of xorSingleBruteforce(value, encoding)) {
            if (seenXor.has(candidate.text)) continue;
            seenXor.add(candidate.text);
            add(
              `xor_single:0x${candidate.hexKey}`,
              candidate.text,
              `Brute force XOR satu byte (0x${candidate.hexKey}), printable ${(candidate.printableRatio * 100).toFixed(0)}%.`,
            );
          }
        }
      }

      const key = extractVigenereKey(hint);
      if (key) {
        tryDecode(`vigenere_decode:key=${key}`, `Kunci Vigenère eksplisit dari petunjuk: ${key}.`, () => vigenere(value, key, true));
      }
    }

    for (const layer of autoDecodeLayers(value, 2)) {
      add(layer.path.join(">"), layer.value, `Lapisan tersemat terdeteksi: ${layer.path.join(" → ")}.`);
    }

    return attempts;
  }
}
