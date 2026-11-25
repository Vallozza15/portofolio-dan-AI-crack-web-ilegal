import { extractFlagCandidates } from "../flag";
import type { ConfidenceLevel, CrossValidationResult } from "./types";

export function crossValidate(input: {
  evidence: Array<{ source: string; detail: string }>;
  challenge?: { flagFormat?: string; expectedFlag?: string };
}): CrossValidationResult {
  const byValue = new Map<string, Set<string>>();

  for (const item of input.evidence) {
    const source = item.source.trim() || "sumber tanpa nama";
    const candidates = extractFlagCandidates(item.detail, source, input.challenge?.flagFormat);
    const seenInSource = new Set<string>();
    for (const candidate of candidates) {
      if (seenInSource.has(candidate.value)) continue;
      seenInSource.add(candidate.value);
      const sources = byValue.get(candidate.value) ?? new Set<string>();
      sources.add(source);
      byValue.set(candidate.value, sources);
    }
  }

  const agreements = [...byValue.entries()]
    .filter(([, sources]) => sources.size >= 2)
    .map(([value, sources]) => ({ value, sources: [...sources] }))
    .sort((a, b) => a.value.localeCompare(b.value));

  const expected = input.challenge?.expectedFlag?.trim() ?? "";
  const expectedSources = expected ? byValue.get(expected) : undefined;
  const expectedSourceCount = expectedSources?.size ?? 0;

  const conflicts = expected
    ? [...byValue.entries()]
        .filter(([value]) => value !== expected)
        .map(([value, sources]) => ({ value, sources: [...sources] }))
        .sort((a, b) => a.value.localeCompare(b.value))
    : [];

  let confidence: ConfidenceLevel;
  let summary: string;
  if (expectedSourceCount >= 1) {
    confidence = "CONFIRMED";
    summary = `Expected flag ditemukan pada ${expectedSourceCount} sumber; verifikasi lokal berhasil.`;
  } else if (expected && conflicts.length > 0) {
    confidence = "INCORRECT";
    summary = `${conflicts.length} kandidat tidak cocok dengan expected flag dan expected flag tidak ditemukan.`;
  } else if (agreements.length >= 1) {
    confidence = "HIGH_CONFIDENCE";
    summary = `${agreements.length} kandidat muncul pada minimal dua sumber berbeda.`;
  } else if (byValue.size > 0) {
    confidence = "PROBABLE";
    summary = `${byValue.size} kandidat ditemukan, tetapi belum ada kesepakatan antarsumber.`;
  } else {
    confidence = "UNVERIFIED";
    summary = "Belum ada kandidat flag yang dapat dibandingkan.";
  }

  return { agreements, conflicts, confidence, summary };
}
