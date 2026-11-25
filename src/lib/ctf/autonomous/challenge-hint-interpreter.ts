import { EncodingDetectionEngine } from "./encoding-detection-engine";
import type { AutonomousLanguage, DecodingAttempt, HintInterpretation, OutputReading, TerminalObservation } from "./types";

const MIN_SUPPORTED_SCORE = 3;
const MIN_SELECTED_SCORE = 4.5;

const METHOD_HINTS: Array<{ name: string; pattern: RegExp }> = [
  { name: "rot13", pattern: /\brot\s*13\b/i },
  { name: "rot47", pattern: /\brot\s*47\b/i },
  { name: "caesar", pattern: /\bcaesar|shift|geser/i },
  { name: "xor", pattern: /\bxor\b/i },
  { name: "vigenere", pattern: /\bvigen[eè]re/i },
  { name: "base64", pattern: /\bbase\s*64\b/i },
  { name: "base32", pattern: /\bbase\s*32\b/i },
  { name: "base58", pattern: /\bbase\s*58\b/i },
  { name: "hex", pattern: /\bhex|heksadesimal/i },
  { name: "binary", pattern: /\bbinary|biner/i },
  { name: "morse", pattern: /\bmorse/i },
  { name: "decimal", pattern: /\bascii|decimal|desimal/i },
  { name: "url", pattern: /\burl|percent/i },
  { name: "html", pattern: /\bhtml|entit/i },
  { name: "unicode", pattern: /\bunicode|escape/i },
  { name: "atbash", pattern: /\batbash/i },
];

const TOKEN_RE = /[A-Za-z0-9+/=_%&;#\\-]{12,}/g;

function tokensIn(text: string, known: string[]): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[0];
    if (token.length >= 12 && !tokens.includes(token)) tokens.push(token);
  }
  for (const token of known) {
    if (token.length >= 8 && text.includes(token) && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

function hintedMethods(text: string): string[] {
  return METHOD_HINTS.filter((item) => item.pattern.test(text)).map((item) => item.name);
}

function inferMeaning(text: string, language: AutonomousLanguage): string {
  const methods = hintedMethods(text);
  const methodText = methods.length ? methods.join(", ") : language === "id" ? "metode yang belum dipastikan" : "an unspecified method";
  const isInstruction = /\b(instruction|instruksi|readme|harus|silakan|please|you must)\b/i.test(text);
  if (language === "id") {
    if (isInstruction) return `Instruksi ini kemungkinan meminta tindakan lanjutan dengan ${methodText}; bukti terminal masih diperlukan.`;
    return `Petunjuk ini kemungkinan menunjuk ke ${methodText}; interpretasi berikut bersifat dugaan tanpa konfirmasi server.`;
  }
  if (isInstruction) return `This instruction likely requests a follow-up action using ${methodText}; terminal evidence is still required.`;
  return `This hint likely points to ${methodText}; the interpretations below are tentative without server confirmation.`;
}

function sourceLabel(observation: TerminalObservation): string {
  const environment = observation.metadata?.environment;
  const detector = observation.metadata?.detector;
  const parts: string[] = [observation.source];
  if (typeof environment === "string") parts.push(environment);
  if (typeof detector === "string" && observation.kind === "encoded") parts.push(detector);
  return parts.join(" / ");
}

export class ChallengeHintInterpreter {
  private readonly encoding: EncodingDetectionEngine;

  constructor(encoding?: EncodingDetectionEngine) {
    this.encoding = encoding ?? new EncodingDetectionEngine();
  }

  interpret(reading: OutputReading, language: AutonomousLanguage): HintInterpretation[] {
    const observations = reading.observations.filter(
      (observation) => observation.kind === "hint" || observation.kind === "encoded" || observation.kind === "instruction",
    );

    return observations.map((observation, index) => {
      const original = observation.text;
      const methods = hintedMethods(original);
      const targets = observation.kind === "encoded" ? [original] : tokensIn(original, reading.encodedCandidates);
      const inputs = targets.length ? targets : [original];
      const attempts: DecodingAttempt[] = [];
      const rejected: string[] = [];

      for (const input of inputs) {
        for (const attempt of this.encoding.decode(input, original, 3)) {
          if (attempt.value === input || attempt.score < MIN_SUPPORTED_SCORE) {
            rejected.push(`${attempt.method}: skor ${attempt.score.toFixed(2)} di bawah ambang dukungan.`);
            continue;
          }
          const aligns = !methods.length || methods.some((name) => attempt.method.toLowerCase().includes(name));
          if (!aligns) {
            rejected.push(`${attempt.method}: bertentangan dengan metode yang disebut petunjuk (${methods.join(", ")}).`);
            continue;
          }
          attempts.push(attempt);
        }
      }

      const unique = new Map<string, DecodingAttempt>();
      for (const attempt of attempts) {
        const existing = unique.get(attempt.value);
        if (!existing || attempt.score > existing.score) unique.set(attempt.value, attempt);
      }
      const ranked = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 5);
      const selected = ranked.find((attempt) => attempt.score >= MIN_SELECTED_SCORE);

      return {
        id: `hint-${index + 1}`,
        original,
        source: sourceLabel(observation),
        meaning: inferMeaning(original, language),
        interpretations: ranked,
        ...(selected ? { selected } : {}),
        rejected,
      } satisfies HintInterpretation;
    });
  }
}
