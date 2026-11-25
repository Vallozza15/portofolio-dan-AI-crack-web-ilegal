import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  randomBytes,
} from "node:crypto";
import type { CipherGCM, DecipherGCM } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const CRYPTO_OPERATIONS = [
  "base64_encode",
  "base64_decode",
  "base64url_encode",
  "base64url_decode",
  "base32_encode",
  "base32_decode",
  "base58_encode",
  "base58_decode",
  "hex_encode",
  "hex_decode",
  "binary_encode",
  "binary_decode",
  "decimal_encode",
  "decimal_decode",
  "url_encode",
  "url_decode",
  "html_encode",
  "html_decode",
  "unicode_escape",
  "unicode_unescape",
  "rot13",
  "rot47",
  "atbash",
  "caesar_shift",
  "caesar_bruteforce",
  "vigenere_encode",
  "vigenere_decode",
  "xor_single_bruteforce",
  "xor_repeating",
  "railfence_encode",
  "railfence_decode",
  "morse_encode",
  "morse_decode",
  "frequency",
  "entropy",
  "hash",
  "hash_identify",
  "auto_decode",
  "aes",
  "rsa",
] as const;

export type CryptoOperation = (typeof CRYPTO_OPERATIONS)[number];

export interface CryptoStep {
  operation: CryptoOperation | string;
  params?: Record<string, string | number | boolean>;
}

export interface CryptoResult {
  operation: string;
  output: string;
  detail?: string;
  data?: unknown;
  error?: string;
}

export interface DecodeLayer {
  operation: string;
  value: string;
  path: string[];
}

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--",
  "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--",
  "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...",
  ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-",
  '"': ".-..-.", "$": "...-..-", "@": ".--.-.",
};

const MORSE_REVERSE = Object.fromEntries(
  Object.entries(MORSE).map(([key, value]) => [value, key]),
);

function bufToBase64(buf: Buffer, url = false) {
  const value = buf.toString("base64");
  return url ? value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : value;
}

export function base64Encode(text: string, url = false) {
  return bufToBase64(Buffer.from(text, "utf8"), url);
}

export function base64Decode(text: string, url = false) {
  let value = text.trim().replace(/\s+/g, "");
  if (url) value = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = value.length % 4;
  if (pad) value += "=".repeat(4 - pad);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Input bukan Base64 yang valid.");
  const buf = Buffer.from(value, "base64");
  const utf8 = buf.toString("utf8");
  return utf8.includes("\uFFFD") ? buf.toString("latin1") : utf8;
}

export function base32Encode(text: string) {
  const bytes = Buffer.from(text, "utf8");
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += "=";
  return output;
}

export function base32Decode(text: string) {
  const clean = text.trim().replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
  if (!/^[A-Z2-7]*$/.test(clean)) throw new Error("Input bukan Base32 yang valid.");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | B32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out).toString("utf8");
}

export function base58Encode(text: string) {
  const bytes = Buffer.from(text, "utf8");
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let num = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let output = "";
  while (num > 0n) {
    output = B58[Number(num % 58n)] + output;
    num /= 58n;
  }
  return "1".repeat(zeros) + output;
}

export function base58Decode(text: string) {
  const clean = text.trim().replace(/\s+/g, "");
  let zeros = 0;
  while (zeros < clean.length && clean[zeros] === "1") zeros += 1;
  let num = 0n;
  for (const char of clean) {
    const index = B58.indexOf(char);
    if (index < 0) throw new Error("Input bukan Base58 yang valid.");
    num = num * 58n + BigInt(index);
  }
  let hex = num === 0n ? "" : num.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex, "hex")]).toString("utf8");
}

export function hexEncode(text: string, separator = " ") {
  return Buffer.from(text, "utf8").toString("hex").match(/.{1,2}/g)?.join(separator) || "";
}

export function hexDecode(text: string) {
  const clean = text.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean || clean.length % 2) throw new Error("Input hex harus memiliki jumlah digit genap.");
  return Buffer.from(clean, "hex").toString("utf8");
}

export function binaryEncode(text: string) {
  return [...Buffer.from(text, "utf8")].map((byte) => byte.toString(2).padStart(8, "0")).join(" ");
}

export function binaryDecode(text: string) {
  const clean = text.replace(/[^01]/g, "");
  if (!clean || clean.length % 8) throw new Error("Input biner harus kelipatan 8 bit.");
  const bytes = clean.match(/.{8}/g)?.map((chunk) => parseInt(chunk, 2)) || [];
  return Buffer.from(bytes).toString("utf8");
}

export function decimalEncode(text: string) {
  return [...Buffer.from(text, "utf8")].join(" ");
}

export function decimalDecode(text: string) {
  const values = text.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error("Nilai desimal harus 0–255.");
  }
  return Buffer.from(values).toString("utf8");
}

export function urlEncode(text: string) {
  return encodeURIComponent(text);
}

export function urlDecode(text: string) {
  return decodeURIComponent(text.replace(/\+/g, " "));
}

export function htmlEncode(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlDecode(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

export function unicodeEscape(text: string) {
  return [...text].map((char) => {
    const code = char.codePointAt(0) || 0;
    return code > 0xffff
      ? `\\u{${code.toString(16)}}`
      : `\\u${code.toString(16).padStart(4, "0")}`;
  }).join("");
}

export function unicodeUnescape(text: string) {
  return text
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

export function rot13(text: string) {
  return text.replace(/[a-z]/gi, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function rot47(text: string) {
  return text.replace(/[!-~]/g, (char) =>
    String.fromCharCode(33 + ((char.charCodeAt(0) - 33 + 47) % 94)),
  );
}

export function atbash(text: string) {
  return text.replace(/[a-z]/gi, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(base + (25 - (char.charCodeAt(0) - base)));
  });
}

export function caesarShift(text: string, shift: number) {
  const normalized = ((shift % 26) + 26) % 26;
  return text.replace(/[a-z]/gi, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + normalized) % 26) + base);
  });
}

export function caesarBruteforce(text: string) {
  return Array.from({ length: 26 }, (_, shift) => {
    const output = caesarShift(text, -shift);
    return { shift, output, score: englishScore(output) };
  }).sort((a, b) => b.score - a.score);
}

export function vigenere(text: string, key: string, decode = false) {
  const cleanKey = key.replace(/[^a-z]/gi, "").toUpperCase();
  if (!cleanKey) throw new Error("Kunci Vigenère tidak boleh kosong.");
  let index = 0;
  return text.replace(/[a-z]/gi, (char) => {
    const base = char <= "Z" ? 65 : 97;
    const shift = cleanKey.charCodeAt(index % cleanKey.length) - 65;
    index += 1;
    const value = char.charCodeAt(0) - base;
    const next = decode ? (value - shift + 26) % 26 : (value + shift) % 26;
    return String.fromCharCode(base + next);
  });
}

export function xorRepeating(input: string, key: string, inputEncoding: "text" | "hex" | "base64" = "text") {
  if (!key) throw new Error("Kunci XOR tidak boleh kosong.");
  const data = decodeInput(input, inputEncoding);
  const keyBytes = Buffer.from(key, "utf8");
  const output = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) output[i] = data[i] ^ keyBytes[i % keyBytes.length];
  return { hex: output.toString("hex"), base64: output.toString("base64"), text: printable(output) };
}

function decodeInput(input: string, encoding: "text" | "utf8" | "hex" | "base64") {
  if (encoding === "hex") return Buffer.from(input.replace(/[^0-9a-f]/gi, ""), "hex");
  if (encoding === "base64") return Buffer.from(input, "base64");
  return Buffer.from(input, "utf8");
}

function printable(buffer: Buffer) {
  return buffer.toString("latin1").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "·");
}

export function xorSingleBruteforce(input: string, inputEncoding: "text" | "hex" | "base64" = "hex") {
  const data = decodeInput(input, inputEncoding);
  return Array.from({ length: 256 }, (_, key) => {
    const output = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 1) output[i] = data[i] ^ key;
    const text = output.toString("latin1");
    const printableRatio = [...text].filter((char) => /[\x09\x0a\x0d\x20-\x7e]/.test(char)).length / Math.max(1, text.length);
    const structure = /[a-z]{3,}\{[^}]{2,}\}/i.test(text) ? 1.4 : /\b(flag|ctf|pico|htb|key|secret|password)\b/i.test(text) ? 0.8 : 0;
    const score = (englishScore(text) + structure) * printableRatio;
    return { key, hexKey: key.toString(16).padStart(2, "0"), score, printableRatio, text: printable(output) };
  }).sort((a, b) => b.score - a.score).slice(0, 12);
}

export function railFenceEncode(text: string, rails: number) {
  if (rails < 2) return text;
  const rows = Array.from({ length: rails }, () => "");
  let rail = 0;
  let direction = 1;
  for (const char of text) {
    rows[rail] += char;
    if (rail === 0) direction = 1;
    if (rail === rails - 1) direction = -1;
    rail += direction;
  }
  return rows.join("");
}

export function railFenceDecode(text: string, rails: number) {
  if (rails < 2) return text;
  const pattern: number[] = [];
  let rail = 0;
  let direction = 1;
  for (let i = 0; i < text.length; i += 1) {
    pattern.push(rail);
    if (rail === 0) direction = 1;
    if (rail === rails - 1) direction = -1;
    rail += direction;
  }
  const counts = Array.from({ length: rails }, (_, index) => pattern.filter((value) => value === index).length);
  const rows = counts.map((count) => text.slice(0, count));
  for (let i = 0; i < rails; i += 1) text = text.slice(counts[i]);
  const offsets = Array.from({ length: rails }, () => 0);
  return pattern.map((index) => rows[index][offsets[index]++] || "").join("");
}

export function morseEncode(text: string) {
  return text.toUpperCase().split("").map((char) => {
    if (char === " ") return "/";
    return MORSE[char] || char;
  }).join(" ").replace(/\s+\/\s+/g, " / ");
}

export function morseDecode(text: string) {
  return text.trim().split(/\s*\/\s*|\s{3,}/).map((word) =>
    word.trim().split(/\s+/).map((token) => MORSE_REVERSE[token] || "?").join(""),
  ).join(" ");
}

export function frequencyAnalysis(text: string) {
  const clean = text.toLowerCase().replace(/[^a-z]/g, "");
  const counts = new Map<string, number>();
  for (const char of clean) counts.set(char, (counts.get(char) || 0) + 1);
  return [...counts.entries()]
    .map(([char, count]) => ({ char, count, percent: (count / Math.max(1, clean.length)) * 100 }))
    .sort((a, b) => b.count - a.count);
}

const ENGLISH_FREQ: Record<string, number> = {
  a: 8.167, b: 1.492, c: 2.782, d: 4.253, e: 12.702, f: 2.228, g: 2.015,
  h: 6.094, i: 6.966, j: 0.153, k: 0.772, l: 4.025, m: 2.406, n: 6.749,
  o: 7.507, p: 1.929, q: 0.095, r: 5.987, s: 6.327, t: 9.056, u: 2.758,
  v: 0.978, w: 2.36, x: 0.15, y: 1.974, z: 0.074,
};

export function englishScore(text: string) {
  const clean = text.toLowerCase().replace(/[^a-z ]/g, "");
  if (clean.replace(/\s/g, "").length < 2) return -2;
  const counts = new Map<string, number>();
  for (const char of clean) counts.set(char, (counts.get(char) || 0) + 1);
  let score = 0;
  for (const [char, expected] of Object.entries(ENGLISH_FREQ)) {
    const actual = ((counts.get(char) || 0) / clean.length) * 100;
    score -= Math.abs(actual - expected) / 100;
  }
  const words = [" the ", " and ", " flag ", " this ", " that ", " with ", " for ", " you ", " not ", " is "];
  for (const word of words) if (` ${clean} `.includes(word)) score += 0.35;
  const letterRatio = clean.length / Math.max(1, text.length);
  return score + Math.min(1, letterRatio) * 0.6;
}

export function shannonEntropy(buffer: Buffer) {
  if (!buffer.length) return 0;
  const counts = new Array<number>(256).fill(0);
  for (const byte of buffer) counts[byte] += 1;
  let entropy = 0;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / buffer.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function calculateHash(algorithm: "md5" | "sha1" | "sha256" | "sha512", input: string, encoding: "utf8" | "hex" | "base64" = "utf8") {
  return createHash(algorithm).update(decodeInput(input, encoding)).digest("hex");
}

export function identifyHash(value: string) {
  const clean = value.trim();
  const candidates: Array<{ type: string; note: string }> = [];
  if (/^[a-f0-9]{32}$/i.test(clean)) candidates.push({ type: "MD5 / NTLM", note: "32 karakter heksadesimal" });
  if (/^[a-f0-9]{40}$/i.test(clean)) candidates.push({ type: "SHA-1", note: "40 karakter heksadesimal" });
  if (/^[a-f0-9]{56}$/i.test(clean)) candidates.push({ type: "SHA-224", note: "56 karakter heksadesimal" });
  if (/^[a-f0-9]{64}$/i.test(clean)) candidates.push({ type: "SHA-256 / SHA3-256 / BLAKE2s", note: "64 karakter heksadesimal" });
  if (/^[a-f0-9]{96}$/i.test(clean)) candidates.push({ type: "SHA-384", note: "96 karakter heksadesimal" });
  if (/^[a-f0-9]{128}$/i.test(clean)) candidates.push({ type: "SHA-512 / SHA3-512 / BLAKE2b", note: "128 karakter heksadesimal" });
  if (/^\$2[aby]\$\d{2}\$/.test(clean)) candidates.push({ type: "bcrypt", note: "Format Modular Crypt $2a/$2b/$2y" });
  if (/^\$argon2(id|i|d)\$/.test(clean)) candidates.push({ type: "Argon2", note: "PHC string format" });
  if (/^\$6\$/.test(clean)) candidates.push({ type: "SHA-512 crypt", note: "Modular Crypt $6$" });
  if (/^\$5\$/.test(clean)) candidates.push({ type: "SHA-256 crypt", note: "Modular Crypt $5$" });
  if (/^\$1\$/.test(clean)) candidates.push({ type: "MD5 crypt", note: "Modular Crypt $1$" });
  if (/^\{SSHA\}/.test(clean)) candidates.push({ type: "SSHA (LDAP)", note: "Base64 salted SHA-1" });
  if (/^[A-Za-z0-9+/]{27}=$/.test(clean)) candidates.push({ type: "Base64 (20 bytes)", note: "Mungkin SHA-1 mentah" });
  return candidates.length ? candidates : [{ type: "Tidak dikenali", note: "Panjang atau prefiks tidak cocok dengan pola umum." }];
}

export function detectEncodings(text: string) {
  const value = text.trim();
  const findings: Array<{ type: string; confidence: "high" | "medium" | "low"; reason: string }> = [];
  if (/^[A-Za-z0-9+/=\s]{8,}$/.test(value) && value.replace(/\s/g, "").length % 4 === 0 && /[A-Za-z]/.test(value)) {
    findings.push({ type: "Base64", confidence: "high", reason: "Alfabet Base64 dan panjang kelipatan 4." });
  }
  if (/^[A-Z2-7=\s]+$/.test(value) && value.replace(/\s/g, "").length >= 8) {
    findings.push({ type: "Base32", confidence: "high", reason: "Hanya alfabet Base32 A–Z dan 2–7." });
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{8,}$/.test(value)) {
    findings.push({ type: "Base58 (mungkin)", confidence: "low", reason: "Alfabet Base58 tanpa karakter ambigu." });
  }
  if (/^(?:[0-9a-fA-F]{2}[\s:]?)+$/.test(value) && value.replace(/[\s:]/g, "").length >= 8) {
    findings.push({ type: "Hexadecimal", confidence: "high", reason: "Pasangan digit heksadesimal." });
  }
  if (/^[01\s]{8,}$/.test(value) && value.replace(/\s/g, "").length % 8 === 0) {
    findings.push({ type: "Binary", confidence: "high", reason: "Hanya 0/1 dengan panjang kelipatan 8." });
  }
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    findings.push({ type: "URL encoding", confidence: "high", reason: "Mengandung %XX." });
  }
  if (/^[.\-/\s]+$/.test(value) && /[.-]/.test(value)) {
    findings.push({ type: "Morse code", confidence: "medium", reason: "Hanya titik, garis, spasi, dan pemisah." });
  }
  if (/^&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value)) {
    findings.push({ type: "HTML entities", confidence: "medium", reason: "Mengandung entitas HTML." });
  }
  if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}/i.test(value)) {
    findings.push({ type: "Escape sequences", confidence: "high", reason: "Mengandung \\uXXXX atau \\xXX." });
  }
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    findings.push({ type: "JWT (mungkin)", confidence: "high", reason: "Tiga segmen dipisahkan titik." });
  }
  return findings;
}

function isMostlyPrintable(text: string) {
  if (!text) return false;
  const printable = [...text].filter((char) => /[\x09\x0a\x0d\x20-\x7e\u00a0-\u024f]/.test(char)).length;
  return printable / text.length > 0.85;
}

interface EmbeddedToken {
  operation: string;
  decoded: string;
}

function embeddedEncodedTokens(text: string): EmbeddedToken[] {
  const found: EmbeddedToken[] = [];
  const seen = new Set<string>();
  const attempt = (operation: string, token: string, decode: () => string) => {
    if (token.length < 8 || token.length > 4096 || seen.has(token)) return;
    seen.add(token);
    try {
      const decoded = decode();
      if (!decoded || decoded === token || decoded.length > 20000) return;
      if (!isMostlyPrintable(decoded)) return;
      if (!/[{}]/.test(decoded) && !/\b[a-z]{3,}\b/i.test(decoded)) return;
      found.push({ operation, decoded });
    } catch {
      // Speculative decode of an embedded token is expected to fail sometimes.
    }
  };

  for (const match of text.matchAll(/[A-Za-z0-9+/]{12,}={0,2}/g)) {
    const token = match[0];
    if (token.length % 4 !== 0) continue;
    if (/^[a-z]+$/.test(token)) continue;
    attempt("base64_decode (embedded)", token, () => base64Decode(token));
  }
  for (const match of text.matchAll(/\b[0-9a-fA-F]{12,}\b/g)) {
    const token = match[0];
    if (token.length % 2 !== 0) continue;
    attempt("hex_decode (embedded)", token, () => hexDecode(token));
  }
  for (const match of text.matchAll(/\b[A-Z2-7]{12,}={0,6}\b/g)) {
    attempt("base32_decode (embedded)", match[0], () => base32Decode(match[0]));
  }
  return found.slice(0, 12);
}

export function autoDecodeLayers(text: string, maxDepth = 5): DecodeLayer[] {
  const results: DecodeLayer[] = [];
  const visited = new Set<string>([text]);
  let frontier: Array<{ value: string; path: string[] }> = [{ value: text, path: [] }];

  for (const token of embeddedEncodedTokens(text)) {
    if (visited.has(token.decoded)) continue;
    visited.add(token.decoded);
    const path = [token.operation];
    results.push({ operation: token.operation, value: token.decoded, path });
    frontier.push({ value: token.decoded, path });
  }

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: Array<{ value: string; path: string[] }> = [];
    for (const node of frontier) {
      const value = node.value.trim();
      const attempts: Array<{ op: string; run: () => string }> = [];
      if (/^[A-Za-z0-9+/=\s]{8,}$/.test(value) && value.replace(/\s/g, "").length % 4 === 0) {
        attempts.push({ op: "base64_decode", run: () => base64Decode(value) });
        attempts.push({ op: "base64url_decode", run: () => base64Decode(value, true) });
      }
      if (/^[0-9a-fA-F\s]+$/.test(value) && value.replace(/\s/g, "").length % 2 === 0) {
        attempts.push({ op: "hex_decode", run: () => hexDecode(value) });
      }
      if (/^[01\s]+$/.test(value) && value.replace(/\s/g, "").length % 8 === 0) {
        attempts.push({ op: "binary_decode", run: () => binaryDecode(value) });
      }
      if (/^[A-Z2-7=\s]{8,}$/.test(value)) {
        attempts.push({ op: "base32_decode", run: () => base32Decode(value) });
      }
      if (/^[1-9A-HJ-NP-Za-km-z]{8,}$/.test(value)) {
        attempts.push({ op: "base58_decode", run: () => base58Decode(value) });
      }
      if (/%[0-9A-Fa-f]{2}/.test(value)) {
        attempts.push({ op: "url_decode", run: () => urlDecode(value) });
      }
      if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value)) {
        attempts.push({ op: "html_decode", run: () => htmlDecode(value) });
      }
      if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}/i.test(value)) {
        attempts.push({ op: "unicode_unescape", run: () => unicodeUnescape(value) });
      }
      if (/^[.\-/\s]+$/.test(value) && /[.-]/.test(value)) {
        attempts.push({ op: "morse_decode", run: () => morseDecode(value) });
      }

      let branches = 0;
      for (const attempt of attempts) {
        if (branches >= 4) break;
        try {
          const decoded = attempt.run();
          if (!decoded || decoded === node.value || !isMostlyPrintable(decoded) || decoded.length > 20000) continue;
          const key = `${node.path.join(">")}>${attempt.op}:${decoded}`;
          if (visited.has(decoded) || visited.has(key)) continue;
          visited.add(decoded);
          visited.add(key);
          branches += 1;
          const path = [...node.path, attempt.op];
          results.push({ operation: attempt.op, value: decoded, path });
          next.push({ value: decoded, path });
        } catch {
          // A failed speculative decode is not an error for the chain detector.
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return results.slice(0, 30);
}

export function runOperation(
  input: string,
  step: CryptoStep,
): CryptoResult {
  const op = step.operation;
  const p = step.params || {};
  try {
    switch (op) {
      case "base64_encode": return { operation: op, output: base64Encode(input) };
      case "base64_decode": return { operation: op, output: base64Decode(input) };
      case "base64url_encode": return { operation: op, output: base64Encode(input, true) };
      case "base64url_decode": return { operation: op, output: base64Decode(input, true) };
      case "base32_encode": return { operation: op, output: base32Encode(input) };
      case "base32_decode": return { operation: op, output: base32Decode(input) };
      case "base58_encode": return { operation: op, output: base58Encode(input) };
      case "base58_decode": return { operation: op, output: base58Decode(input) };
      case "hex_encode": return { operation: op, output: hexEncode(input, String(p.separator ?? " ")) };
      case "hex_decode": return { operation: op, output: hexDecode(input) };
      case "binary_encode": return { operation: op, output: binaryEncode(input) };
      case "binary_decode": return { operation: op, output: binaryDecode(input) };
      case "decimal_encode": return { operation: op, output: decimalEncode(input) };
      case "decimal_decode": return { operation: op, output: decimalDecode(input) };
      case "url_encode": return { operation: op, output: urlEncode(input) };
      case "url_decode": return { operation: op, output: urlDecode(input) };
      case "html_encode": return { operation: op, output: htmlEncode(input) };
      case "html_decode": return { operation: op, output: htmlDecode(input) };
      case "unicode_escape": return { operation: op, output: unicodeEscape(input) };
      case "unicode_unescape": return { operation: op, output: unicodeUnescape(input) };
      case "rot13": return { operation: op, output: rot13(input) };
      case "rot47": return { operation: op, output: rot47(input) };
      case "atbash": return { operation: op, output: atbash(input) };
      case "caesar_shift": return { operation: op, output: caesarShift(input, Number(p.shift ?? 3)) };
      case "caesar_bruteforce": {
        const candidates = caesarBruteforce(input);
        return {
          operation: op,
          output: candidates.map((item) => `[shift ${item.shift}] ${item.output}`).join("\n"),
          data: candidates,
        };
      }
      case "vigenere_encode": return { operation: op, output: vigenere(input, String(p.key ?? ""), false) };
      case "vigenere_decode": return { operation: op, output: vigenere(input, String(p.key ?? ""), true) };
      case "xor_single_bruteforce": {
        const candidates = xorSingleBruteforce(input, (p.encoding as "text" | "hex" | "base64") || "hex");
        return {
          operation: op,
          output: candidates.map((item) => `[key 0x${item.hexKey}] ${item.text}`).join("\n"),
          data: candidates,
        };
      }
      case "xor_repeating": {
        const result = xorRepeating(input, String(p.key ?? ""), (p.encoding as "text" | "hex" | "base64") || "text");
        return { operation: op, output: String(p.output ?? "text") === "hex" ? result.hex : result.text, data: result };
      }
      case "railfence_encode": return { operation: op, output: railFenceEncode(input, Number(p.rails ?? 3)) };
      case "railfence_decode": {
        const rails = Number(p.rails ?? 0);
        if (rails >= 2) return { operation: op, output: railFenceDecode(input, rails) };
        return {
          operation: op,
          output: Array.from({ length: 8 }, (_, index) => `[${index + 2} rails] ${railFenceDecode(input, index + 2)}`).join("\n"),
        };
      }
      case "morse_encode": return { operation: op, output: morseEncode(input) };
      case "morse_decode": return { operation: op, output: morseDecode(input) };
      case "frequency": {
        const data = frequencyAnalysis(input);
        return { operation: op, output: data.map((item) => `${item.char}: ${item.count} (${item.percent.toFixed(2)}%)`).join("\n"), data };
      }
      case "entropy": {
        const value = shannonEntropy(Buffer.from(input, "utf8"));
        return { operation: op, output: `${value.toFixed(6)} bits/byte`, data: { entropy: value } };
      }
      case "hash": {
        const algorithm = String(p.algorithm ?? "sha256") as "md5" | "sha1" | "sha256" | "sha512";
        return { operation: op, output: calculateHash(algorithm, input, (p.encoding as "utf8" | "hex" | "base64") || "utf8") };
      }
      case "hash_identify": {
        const data = identifyHash(input);
        return { operation: op, output: data.map((item) => `${item.type} — ${item.note}`).join("\n"), data };
      }
      case "auto_decode": {
        const layers = autoDecodeLayers(input, Number(p.depth ?? 5));
        return {
          operation: op,
          output: layers.length
            ? layers.map((layer) => `[${layer.path.join(" → ")}]\n${layer.value}`).join("\n\n")
            : "Tidak ada lapisan encoding tambahan yang terdeteksi.",
          data: layers,
        };
      }
      case "aes": return aesOperation(input, p);
      case "rsa": return rsaOperation(p);
      default:
        return { operation: String(op), output: "", error: `Operasi tidak dikenal: ${op}` };
    }
  } catch (error) {
    return {
      operation: String(op),
      output: "",
      error: error instanceof Error ? error.message : "Operasi gagal.",
    };
  }
}

export function runRecipe(input: string, steps: CryptoStep[]) {
  const results: CryptoResult[] = [];
  let value = input;
  for (const step of steps) {
    const result = runOperation(value, step);
    results.push(result);
    if (result.error) break;
    value = result.output;
  }
  return { output: value, steps: results };
}

function parseKeyMaterial(value: string, encoding: string): Buffer {
  if (encoding === "hex") return Buffer.from(value.replace(/[^0-9a-f]/gi, ""), "hex");
  if (encoding === "base64") return Buffer.from(value, "base64");
  return Buffer.from(value, "utf8");
}

function aesOperation(input: string, params: Record<string, string | number | boolean>): CryptoResult {
  const action = String(params.action ?? "decrypt");
  const algorithm = String(params.algorithm ?? "aes-256-cbc");
  const key = parseKeyMaterial(String(params.key ?? ""), String(params.keyEncoding ?? "utf8"));
  const iv = parseKeyMaterial(String(params.iv ?? ""), String(params.ivEncoding ?? "utf8"));
  const inputEncoding = String(params.inputEncoding ?? "base64") as "utf8" | "hex" | "base64";
  const inputData = decodeInput(input, inputEncoding);

  if (![16, 24, 32].includes(key.length)) {
    throw new Error("Panjang kunci AES harus 16, 24, atau 32 byte.");
  }
  if (algorithm.includes("gcm")) {
    if (action === "decrypt") {
      const tag = parseKeyMaterial(String(params.tag ?? ""), String(params.tagEncoding ?? "hex"));
      if (tag.length !== 16) throw new Error("Auth tag GCM harus 16 byte.");
      const decipher = createDecipheriv(algorithm, key, iv) as DecipherGCM;
      decipher.setAuthTag(tag);
      const output = Buffer.concat([decipher.update(inputData), decipher.final()]);
      return { operation: "aes", output: output.toString("utf8") };
    }
    const ivValue = iv.length ? iv : randomBytes(12);
    const cipher = createCipheriv(algorithm, key, ivValue) as CipherGCM;
    const output = Buffer.concat([cipher.update(inputData), cipher.final()]);
    return {
      operation: "aes",
      output: output.toString("base64"),
      detail: `IV: ${ivValue.toString("hex")} | Tag: ${cipher.getAuthTag().toString("hex")}`,
    };
  }

  if (action === "decrypt") {
    const decipher = createDecipheriv(algorithm, key, algorithm === "aes-256-ecb" ? null : iv);
    const output = Buffer.concat([decipher.update(inputData), decipher.final()]);
    return { operation: "aes", output: output.toString("utf8") };
  }

  const cipher = createCipheriv(algorithm, key, algorithm === "aes-256-ecb" ? null : iv);
  const output = Buffer.concat([cipher.update(inputData), cipher.final()]);
  return { operation: "aes", output: output.toString("base64") };
}

function toBigInt(value: string | number | boolean | undefined): bigint {
  const text = String(value ?? "0").trim();
  if (/^0x/i.test(text)) return BigInt(text);
  return BigInt(text);
}

function modPow(base: bigint, exponent: bigint, modulus: bigint) {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function modInverse(a: bigint, m: bigint) {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error("Inverse modulo tidak ada — periksa p, q, dan e.");
  return ((oldS % m) + m) % m;
}

function bigIntToBuffer(value: bigint) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.from(hex, "hex");
}

function rsaOperation(params: Record<string, string | number | boolean>): CryptoResult {
  const action = String(params.action ?? "decrypt");
  if (action === "inspect") {
    const pem = String(params.publicKey ?? "");
    if (!pem.includes("BEGIN")) throw new Error("Masukkan public key PEM.");
    const key = createPublicKey(pem);
    const jwk = key.export({ format: "jwk" }) as { n?: string; e?: string; kty?: string };
    const modulus = jwk.n ? Buffer.from(jwk.n, "base64url") : Buffer.alloc(0);
    return {
      operation: "rsa",
      output: `Tipe: ${jwk.kty || "RSA"}\nModulus: ${modulus.length * 8} bit\nExponent: ${jwk.e ? Buffer.from(jwk.e, "base64url").toString("hex") : "?"}`,
      detail: `n (hex): ${modulus.toString("hex")}`,
    };
  }

  const n = toBigInt(params.n);
  const e = toBigInt(params.e);
  const c = toBigInt(params.c);
  if (n <= 0n || e <= 0n) throw new Error("n dan e harus lebih besar dari 0.");
  let p = params.p ? toBigInt(params.p) : 0n;
  let q = params.q ? toBigInt(params.q) : 0n;

  if (!p || !q) {
    const factor = trialFactor(n, 2_000_000n);
    if (!factor) throw new Error("Faktorisasi otomatis gagal. Masukkan p dan q secara manual.");
    p = factor;
    q = n / factor;
  }
  if (p * q !== n) throw new Error("p × q tidak sama dengan n.");
  const phi = (p - 1n) * (q - 1n);
  const d = modInverse(e, phi);
  const m = modPow(c, d, n);
  const plain = bigIntToBuffer(m);
  const utf8 = plain.toString("utf8");
  return {
    operation: "rsa",
    output: utf8.includes("\uFFFD") ? plain.toString("latin1") : utf8,
    detail: `p = ${p}\nq = ${q}\nd = ${d}\nm (hex) = ${m.toString(16)}`,
    data: { p: p.toString(), q: q.toString(), d: d.toString(), m: m.toString() },
  };
}

function trialFactor(n: bigint, limit: bigint) {
  if (n % 2n === 0n) return 2n;
  for (let i = 3n; i <= limit && i * i <= n; i += 2n) {
    if (n % i === 0n) return i;
  }
  return null;
}

export function decodeJwt(token: string) {
  const parts = token.trim().split(".");
  if (parts.length < 2) throw new Error("JWT harus memiliki minimal dua segmen.");
  const decode = (value: string) => JSON.parse(base64Decode(value, true));
  return {
    header: decode(parts[0]) as Record<string, unknown>,
    payload: decode(parts[1]) as Record<string, unknown>,
    signature: parts[2] || "",
    note: "Tanda tangan tidak diverifikasi. Decode ini hanya untuk inspeksi.",
  };
}
