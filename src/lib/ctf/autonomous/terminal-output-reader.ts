import { caesarBruteforce, detectEncodings } from "../crypto";
import type {
  OutputReading,
  RemoteEnvironment,
  TerminalObservation,
} from "./types";

type ObservationKind = TerminalObservation["kind"];
type ObservationSource = TerminalObservation["source"];

interface ClassifiedLine {
  kind: ObservationKind;
  confidence: number;
  indicator?: string;
}

const PERMISSION_RE = /permission denied|akses ditolak|not permitted|operation not permitted|read-only file system|sudo required/i;
const ERROR_RE = /\b(error|fatal|traceback|exception|command not found|no such file|kesalahan)\b/i;
const FAILURE_RE = /\b(fail(?:ed|ure)?|wrong|salah|invalid|tidak valid|unable|missing|tidak ditemukan|not found|denied|ditolak)\b/i;
const SUCCESS_RE = /\b(success|successful|berhasil|correct|benar|valid|accepted|diterima|complete|completed|selesai|done|flag\{)\b/i;
const STAGE_RE = /\b(stage|tahap|level|phase|round|babak|step\s*\d+)\b/i;
const HINT_RE = /\b(hint|petunjuk|clue|rot13|rot47|rot\s*13|caesar|xor|base64|base32|base58|hex|binary|morse|decode|dekode|try|coba|tips)\b/i;
const INSTRUCTION_RE = /\b(instruction|instruksi|readme|please|silakan|you must|harus|first|pertama|next|langkah|catatan|note)\b/i;
const FILE_RE = /\b(file|berkas|\.txt|\.sh|\.py|\.bin|\.zip|\.pcap|\.png|\.jpe?g|\.json|\.csv|\.pdf)\b/i;
const PATH_RE = /((?:\.{1,2}\/)?\/(?:[A-Za-z0-9._~+@-]+\/?)+|(?:\.{1,2}\/)[A-Za-z0-9._~+\/-]+|(?:^|[\s:="'])[A-Za-z0-9._-]+\/[A-Za-z0-9._\/-]+)/g;

const KNOWN_FLAG_PREFIXES = new Set([
  "flag", "ctf", "picoctf", "htb", "thm", "nite", "ductf", "idek", "uiuctf",
  "corctf", "lactf", "maple", "pwn", "shell", "hacktoday", "compfest",
  "gemastik", "cyberjawara", "lks", "tcp1p", "findit", "wreckit", "spark",
]);

const UNKNOWN_FLAG_TOKEN_RE = /\b([A-Za-z][A-Za-z0-9_]{1,24})\{([^{}\r\n]{2,200})\}/g;

const TOKEN_PATTERNS: Array<{ detector: string; pattern: RegExp }> = [
  { detector: "base64_decode", pattern: /\b[A-Za-z0-9+/]{12,}={0,2}(?![A-Za-z0-9+/=])/g },
  { detector: "base32_decode", pattern: /\b[A-Z2-7]{12,}={0,6}(?![A-Z2-7=])/g },
  { detector: "hex_decode", pattern: /\b(?:0x)?[0-9a-fA-F]{12,}\b/g },
  { detector: "binary_decode", pattern: /\b[01]{16,}\b/g },
];

function classifyLine(line: string, fromStderr: boolean): ClassifiedLine {
  if (PERMISSION_RE.test(line)) return { kind: "permission", confidence: 0.92, indicator: line.match(PERMISSION_RE)?.[0] };
  if (fromStderr || ERROR_RE.test(line)) return { kind: "error", confidence: 0.9, indicator: line.match(ERROR_RE)?.[0] };
  if (FAILURE_RE.test(line)) return { kind: "failure", confidence: 0.85, indicator: line.match(FAILURE_RE)?.[0] };
  if (SUCCESS_RE.test(line)) return { kind: "success", confidence: 0.86, indicator: line.match(SUCCESS_RE)?.[0] };
  if (STAGE_RE.test(line)) return { kind: "stage", confidence: 0.8, indicator: line.match(STAGE_RE)?.[0] };
  if (HINT_RE.test(line)) return { kind: "hint", confidence: 0.78, indicator: line.match(HINT_RE)?.[0] };
  if (INSTRUCTION_RE.test(line)) return { kind: "instruction", confidence: 0.72, indicator: line.match(INSTRUCTION_RE)?.[0] };
  if (FILE_RE.test(line)) return { kind: "file", confidence: 0.62, indicator: line.match(FILE_RE)?.[0] };
  return { kind: "plain", confidence: 0.4 };
}

function confidenceForEncoded(token: string): number {
  const findings = detectEncodings(token);
  if (findings.some((finding) => finding.confidence === "high")) return 0.86;
  if (findings.some((finding) => finding.confidence === "medium")) return 0.72;
  if (findings.length) return 0.55;
  return 0.45;
}

/** Finds verbatim encoded tokens without normalizing or rewriting them. */
function extractEncodedTokens(line: string): Array<{ token: string; detector: string }> {
  const found: Array<{ token: string; detector: string }> = [];
  const seen = new Set<string>();

  for (const { detector, pattern } of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const token = match[0];
      if (token.length < 12 || seen.has(token)) continue;
      if (!detectEncodings(token).length) continue;
      seen.add(token);
      found.push({ token, detector });
    }
  }

  UNKNOWN_FLAG_TOKEN_RE.lastIndex = 0;
  let flagMatch: RegExpExecArray | null;
  while ((flagMatch = UNKNOWN_FLAG_TOKEN_RE.exec(line)) !== null) {
    const token = flagMatch[0];
    if (KNOWN_FLAG_PREFIXES.has(flagMatch[1].toLowerCase())) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    found.push({ token, detector: "caesar_candidate" });
  }

  if (/^[.\-/\s]+$/.test(line.trim()) && /[.-]/.test(line.trim()) && line.trim().length >= 5) {
    const token = line.trim();
    if (!seen.has(token)) found.push({ token, detector: "morse_decode" });
  }
  if (/%[0-9A-Fa-f]{2}/.test(line)) {
    for (const match of line.matchAll(/(?:[A-Za-z0-9]|[%][0-9A-Fa-f]{2}){4,}/g)) {
      const token = match[0];
      if (/%[0-9A-Fa-f]{2}/.test(token) && !seen.has(token)) {
        seen.add(token);
        found.push({ token, detector: "url_decode" });
      }
    }
  }
  if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}/i.test(line)) {
    const token = line.trim();
    if (!seen.has(token)) found.push({ token, detector: "unicode_unescape" });
  }
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(line)) {
    const token = line.trim();
    if (!seen.has(token)) found.push({ token, detector: "html_decode" });
  }

  // A full sentence can be Caesar/ROT13 encoded. Detect it from the decoded
  // meaning instead of assuming a particular alphabet or flag prefix.
  const whole = line.trim();
  const words = whole.match(/\b[A-Za-z]{2,}\b/g) || [];
  if (
    whole.length >= 16 &&
    whole.length <= 500 &&
    words.length >= 4 &&
    !seen.has(whole) &&
    !detectEncodings(whole).length
  ) {
    const best = caesarBruteforce(whole)[0];
    const meaningful =
      best &&
      best.shift !== 0 &&
      best.score >= 0.35 &&
      (INSTRUCTION_RE.test(best.output) ||
        HINT_RE.test(best.output) ||
        STAGE_RE.test(best.output) ||
        FILE_RE.test(best.output));
    if (meaningful) {
      seen.add(whole);
      found.push({ token: whole, detector: best.shift === 13 ? "rot13_candidate" : "caesar_candidate" });
    }
  }

  return found;
}

function extractPaths(line: string): string[] {
  const paths: string[] = [];
  PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_RE.exec(line)) !== null) {
    const path = (match[1] || "").trim().replace(/["']$/, "");
    if (path.length < 2 || paths.includes(path)) continue;
    paths.push(path);
  }
  return paths;
}

function pushUnique(target: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed && !target.includes(trimmed)) target.push(trimmed);
}

export class TerminalOutputReader {
  read(stdout: string, stderr: string, source: RemoteEnvironment = "remote-ctf"): OutputReading {
    const observations: TerminalObservation[] = [];
    const encodedCandidates: string[] = [];
    const paths: string[] = [];
    const stageIndicators: string[] = [];
    const successIndicators: string[] = [];
    const failureIndicators: string[] = [];

    const lines: Array<{ text: string; origin: ObservationSource }> = [];
    for (const text of stdout.split(/\r?\n/)) lines.push({ text, origin: "stdout" });
    for (const text of stderr.split(/\r?\n/)) lines.push({ text, origin: "stderr" });

    lines.forEach(({ text: line, origin }, lineIndex) => {
      if (!line.trim()) return;

      const tokens = extractEncodedTokens(line);
      const trimmed = line.trim();
      const isPureEncoded = tokens.length === 1 && tokens[0].token === trimmed;
      const classified = classifyLine(line, origin === "stderr");

      if (!isPureEncoded) {
        let kind = classified.kind;
        if (kind === "plain" && tokens.length) kind = "encoded";
        const linePaths = extractPaths(line);
        if (kind === "plain" && linePaths.length && trimmed.startsWith("/")) kind = "path";

        observations.push({
          id: `obs-${origin}-${lineIndex + 1}`,
          kind,
          text: line,
          source: origin,
          confidence: kind === "plain" ? 0.4 : classified.confidence,
          metadata: {
            environment: source,
            line: lineIndex + 1,
            ...(classified.indicator ? { indicator: classified.indicator } : {}),
          },
        });
      }

      for (const [tokenIndex, { token, detector }] of tokens.entries()) {
        if (isPureEncoded && tokenIndex === 0) {
          observations.push({
            id: `obs-${origin}-${lineIndex + 1}-encoded`,
            kind: "encoded",
            text: token,
            source: origin,
            confidence: confidenceForEncoded(token),
            metadata: { environment: source, line: lineIndex + 1, detector, verbatim: true },
          });
        } else {
          observations.push({
            id: `obs-${origin}-${lineIndex + 1}-encoded-${tokenIndex}`,
            kind: "encoded",
            text: token,
            source: origin,
            confidence: confidenceForEncoded(token),
            metadata: { environment: source, line: lineIndex + 1, detector, verbatim: true },
          });
        }
        pushUnique(encodedCandidates, token);
      }

      for (const path of extractPaths(line)) pushUnique(paths, path);
      if (classified.indicator) {
        if (classified.kind === "stage") pushUnique(stageIndicators, classified.indicator);
        if (classified.kind === "success") pushUnique(successIndicators, classified.indicator);
        if (classified.kind === "failure" || classified.kind === "error" || classified.kind === "permission") {
          pushUnique(failureIndicators, classified.indicator);
        }
      }
    });

    return {
      raw: stderr ? `${stdout}${stdout.endsWith("\n") ? "" : "\n"}${stderr}` : stdout,
      stdout,
      stderr,
      observations,
      encodedCandidates,
      paths,
      stageIndicators,
      successIndicators,
      failureIndicators,
    };
  }
}
