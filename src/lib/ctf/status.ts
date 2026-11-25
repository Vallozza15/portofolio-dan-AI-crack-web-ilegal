import { analyzeText } from "./analyzer";
import type { LocalAnalysisBundle, VerificationStatus } from "./types";

export interface StatusEvidence {
  title: string;
  summary: string;
  detail: string;
  confidence: string;
}

/**
 * Infers the verification status from a completed assistant answer.
 *
 * A flag that matches the locally supplied expected flag is always VERIFIED,
 * regardless of what the model wrote. Terminal output is analyzed with the
 * same deterministic extractor as uploaded files, so a flag printed by a real
 * Kali command can also reach VERIFIED.
 */
export function inferStatus(
  text: string,
  bundle?: LocalAnalysisBundle,
  extraEvidence?: StatusEvidence[],
): VerificationStatus {
  const expected = bundle?.challenge.expectedFlag;
  const terminalText = (extraEvidence || []).map((item) => item.detail).join("\n");
  const terminalCandidates = terminalText
    ? analyzeText(terminalText, bundle?.challenge.flagFormat).flagCandidates
    : [];
  const candidates = [...(bundle?.flagCandidates || []), ...terminalCandidates];
  // Merely mentioning the expected flag in the report is NOT verification.
  // It must be extracted as a real candidate from uploaded or executed evidence.
  if (expected) {
    if (candidates.some((candidate) => candidate.value === expected)) return "VERIFIED";
    // With an explicit oracle, a different candidate is not merely LIKELY:
    // the expected answer was not reproduced, so the chain is incomplete.
    if (candidates.length) return "INCOMPLETE";
  }
  const mentions = text.match(/\b(VERIFIED|LIKELY|INCOMPLETE|UNSOLVED)\b/g);
  const last = mentions?.at(-1);
  if (last === "UNSOLVED") return "UNSOLVED";
  if (last === "INCOMPLETE") return "INCOMPLETE";
  if (candidates.length) return "LIKELY";
  if (last === "LIKELY") return "LIKELY";
  return bundle?.status || "INCOMPLETE";
}
