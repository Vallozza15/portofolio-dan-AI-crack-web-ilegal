import { extractFlagCandidates, normalizeCustomFormat } from "../flag";
import type { CandidateSolution } from "./types";

export interface MultiStrategyValidationInput {
  value: string;
  source: string;
  method: string;
  hintTexts: string[];
  terminalOutputs: string[];
  historyOutputs: string[];
  expectedFlag?: string;
  flagFormat?: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stableId(value: string, source: string, method: string): string {
  let hash = 2166136261;
  for (const char of `${source}|${method}|${value}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `candidate-${(hash >>> 0).toString(16)}`;
}

function containsValue(outputs: string[], value: string): boolean {
  if (!value) return false;
  if (outputs.some((output) => output.includes(value))) return true;
  return outputs.some((output) =>
    extractFlagCandidates(output, "terminal").some((candidate) => candidate.value === value),
  );
}

export class MultiStrategyValidator {
  validate(input: MultiStrategyValidationInput): CandidateSolution {
    const value = input.value.trim();
    const hintText = input.hintTexts.join("\n").toLowerCase();
    const expected = input.expectedFlag?.trim();

    let hintAlignment = 0;
    if (hintText.includes(value.toLowerCase())) hintAlignment += 0.45;
    const methodWords = input.method
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !["decode", "single", "shift", "brute", "force"].includes(word));
    for (const word of methodWords) if (hintText.includes(word)) hintAlignment += 0.12;
    if (input.hintTexts.some((hint) => /hint|petunjuk|clue/i.test(hint))) hintAlignment += 0.1;
    hintAlignment = clamp(hintAlignment);

    const terminalSupport = containsValue(input.terminalOutputs, value) ? 1 : 0;
    const historySupport = containsValue(input.historyOutputs, value) ? 0.6 : 0;

    const customFormat = normalizeCustomFormat(input.flagFormat);
    const flagLike = extractFlagCandidates(value, "candidate", input.flagFormat).length > 0;
    const formatMatches = customFormat ? customFormat.test(value) : false;
    const formatScore = clamp(
      (expected && value === expected ? 0.4 : 0) + (flagLike ? 0.4 : 0) + (formatMatches ? 0.4 : 0) + (flagLike || formatMatches ? 0.2 : 0),
    );

    // A hint or prose mention is never an oracle. Only real terminal evidence or
    // an explicit expectedFlag equality supplied by context can set this flag.
    const oracleMatch = terminalSupport === 1 || Boolean(expected && value === expected);

    const score = clamp(
      0.25 * hintAlignment +
        0.3 * terminalSupport +
        0.15 * historySupport +
        0.15 * formatScore +
        (oracleMatch ? 0.15 : 0),
    );

    return {
      id: stableId(value, input.source, input.method),
      value,
      source: input.source,
      method: input.method,
      hintAlignment: Number(hintAlignment.toFixed(3)),
      terminalSupport,
      historySupport,
      formatScore: Number(formatScore.toFixed(3)),
      oracleMatch,
      score: Number(score.toFixed(3)),
    };
  }

  select(candidates: CandidateSolution[]): CandidateSolution | null {
    if (!candidates.length) return null;
    return [...candidates].sort(
      (a, b) =>
        b.score - a.score ||
        b.terminalSupport - a.terminalSupport ||
        Number(b.oracleMatch) - Number(a.oracleMatch) ||
        a.id.localeCompare(b.id),
    )[0];
  }
}
