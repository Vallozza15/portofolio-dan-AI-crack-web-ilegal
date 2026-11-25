import type { FlagCandidate } from "../types";

/**
 * Small pure helpers shared by the adaptive execution engine. Keeping them
 * separate makes the engine easier to test without touching terminal state.
 */
export class AdaptiveExecutionEngineHelpers {
  /** Remove duplicate flag candidates while preserving the strongest source. */
  static uniqueCandidates(candidates: FlagCandidate[]): FlagCandidate[] {
    const byValue = new Map<string, FlagCandidate>();
    for (const candidate of candidates) {
      const value = candidate.value?.trim();
      if (!value) continue;
      const existing = byValue.get(value);
      if (!existing || candidate.confidence > existing.confidence) {
        byValue.set(value, { ...candidate, value });
      }
    }
    return [...byValue.values()].sort((a, b) => b.confidence - a.confidence);
  }

  static firstMeaningfulLine(text: string, maxLength = 240): string {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines[0]?.slice(0, maxLength) || "";
  }
}
