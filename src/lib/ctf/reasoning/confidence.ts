import type { ConfidenceAssessment, ConfidenceLevel } from "./types";

export function evaluateConfidence(input: {
  expectedFlag?: string;
  candidates: Array<{ value: string; source: string }>;
  agreements: number;
  conflicts: number;
  terminalSources: number;
  status?: "VERIFIED" | "LIKELY" | "INCOMPLETE" | "UNSOLVED";
}): ConfidenceAssessment {
  const expected = input.expectedFlag?.trim() ?? "";
  const matched = Boolean(expected && input.candidates.some((candidate) => candidate.value.trim() === expected));
  const agreements = Math.max(0, input.agreements);
  const conflicts = Math.max(0, input.conflicts);
  const terminalSources = Math.max(0, input.terminalSources);

  let level: ConfidenceLevel;
  let score: number;
  let note: string;

  if (expected && matched) {
    level = "CONFIRMED";
    score = 1;
    note = "Kandidat cocok dengan expected flag; verifikasi lokal terpenuhi.";
  } else if (expected) {
    level = "INCORRECT";
    score = 0.15;
    note = conflicts > 0
      ? "Expected flag tidak ditemukan dan ada kandidat yang bertentangan."
      : "Expected flag tidak ditemukan pada kandidat yang tersedia.";
  } else if (agreements >= 2 && terminalSources >= 1) {
    level = "HIGH_CONFIDENCE";
    score = 0.85;
    note = "Kesepakatan antarsumber didukung bukti terminal.";
  } else if (agreements >= 1 || (input.candidates.length >= 1 && terminalSources >= 1)) {
    level = "PROBABLE";
    score = 0.65;
    note = "Ada dukungan terbatas, tetapi belum cukup untuk verifikasi penuh.";
  } else {
    level = "UNVERIFIED";
    score = 0.2;
    note = "Belum ada bukti yang cukup untuk menetapkan kandidat.";
  }

  if (input.status === "VERIFIED" && level !== "CONFIRMED") {
    note += " Status VERIFIED tidak diterima tanpa kecocokan expected flag.";
  }

  return { level, score, note };
}
