import { extractFlagCandidates } from "../flag";
import type {
  AnswerVerification,
  CompletionResult,
  VerificationResult,
} from "./types";

export interface FinalAnswerInput {
  verification: VerificationResult;
  completion: CompletionResult;
  terminalOutputs: string[];
  historyOutputs: string[];
  stage: number;
}

/**
 * Dedicated Final Answer Verifier.
 *
 * It translates the lower-level flag verification result into the answer-level
 * vocabulary used by the UI: CONFIRMED, HIGH CONFIDENCE, PROBABLE, UNVERIFIED.
 * A probable answer is never promoted to CONFIRMED.
 */
export class FinalAnswerVerifier {
  verify(input: FinalAnswerInput): AnswerVerification {
    const candidate =
      input.verification.candidate?.value?.trim() ||
      input.completion.flag?.trim() ||
      "";
    if (!candidate) {
      return {
        classification: "UNVERIFIED",
        confirmed: false,
        reasons: ["Tidak ada kandidat jawaban yang dapat diverifikasi."],
        evidence: [],
      };
    }

    const evidence = [...input.verification.evidence];
    const reasons: string[] = [];
    const terminalHits = new Set(
      input.terminalOutputs.filter((output) => output.includes(candidate)),
    ).size;
    const historyHits = new Set(input.historyOutputs.filter((output) => output.includes(candidate))).size;
    const flagShaped = extractFlagCandidates(candidate, "final-answer").length > 0;
    const serverIndicator = evidence.some((item) => /server|oracle/i.test(item));
    const noPendingStage = input.completion.continuationSignals.length === 0;
    const stageConsistent = input.stage >= 1 && noPendingStage;

    if (terminalHits) evidence.push(`Kandidat muncul pada ${terminalHits} output terminal nyata.`);
    if (historyHits) evidence.push(`Kandidat muncul pada ${historyHits} riwayat dekode.`);
    if (flagShaped) evidence.push("Kandidat sesuai format flag yang dikenali.");
    if (stageConsistent) evidence.push("Tidak ada tahap lanjutan yang belum diselesaikan.");
    if (input.verification.status === "VERIFIED") {
      reasons.push("Oracle/server atau expectedFlag menerima kandidat secara langsung.");
    } else if (input.verification.status === "CONFLICTED") {
      reasons.push("Kandidat bertentangan dengan expectedFlag, sehingga tidak dapat dikonfirmasi.");
    } else if (input.verification.status === "POTENTIAL") {
      reasons.push("Kandidat didukung output nyata tetapi belum diterima oracle/server.");
    } else {
      reasons.push("Tidak ada bukti verifikasi yang cukup untuk kandidat ini.");
    }

    let classification: AnswerVerification["classification"] = "UNVERIFIED";
    if (input.verification.status === "CONFLICTED") {
      classification = "REJECTED";
    } else if (input.verification.status === "VERIFIED" && input.completion.completed) {
      classification = "CONFIRMED";
    } else if (terminalHits > 0) {
      const independent = terminalHits >= 2 || (terminalHits >= 1 && serverIndicator);
      classification = independent && stageConsistent ? "HIGH CONFIDENCE" : "PROBABLE";
    }

    return {
      classification,
      confirmed: classification === "CONFIRMED",
      reasons,
      evidence: [...new Set(evidence)].slice(0, 8),
    };
  }
}
