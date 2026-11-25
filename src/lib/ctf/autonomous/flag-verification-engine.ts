import { extractFlagCandidates } from "../flag";
import type { CandidateSolution, VerificationContext, VerificationResult } from "./types";

function candidateFromString(value: string): CandidateSolution {
  return {
    id: `candidate-direct-${value.length}`,
    value,
    source: "input",
    method: "direct",
    hintAlignment: 0,
    terminalSupport: 0,
    historySupport: 0,
    formatScore: 0,
    oracleMatch: false,
    score: 0,
  };
}

export class FlagVerificationEngine {
  verify(candidate: string | CandidateSolution, context: VerificationContext): VerificationResult {
    const base = typeof candidate === "string" ? candidateFromString(candidate) : candidate;
    const value = base.value.trim();
    const expected = context.expectedFlag?.trim();
    const matchesExpected = Boolean(expected && value === expected);
    const conflictsExpected = Boolean(expected && !matchesExpected);

    const inTerminal = context.terminalOutputs.some((output) => output.includes(value));
    const inHistory = context.historyOutputs.some((output) => output.includes(value));
    const flagLike = extractFlagCandidates(value, "candidate").length > 0;
    const evidence: string[] = [];

    if (context.oracleAccepted) evidence.push("Oracle server menerima kandidat secara eksplisit.");
    if (matchesExpected) evidence.push("Kandidat sama persis dengan expectedFlag dari konteks.");
    if (conflictsExpected) evidence.push("Kandidat berbeda dengan expectedFlag dari konteks.");
    if (inTerminal) evidence.push("Kandidat muncul pada output terminal nyata.");
    if (inHistory) evidence.push("Kandidat juga muncul pada riwayat perintah.");
    if (context.serverCompletionIndicators.length) {
      evidence.push(`Indikator penyelesaian server: ${context.serverCompletionIndicators.slice(0, 2).join("; ")}.`);
    }
    evidence.push("Teks petunjuk atau masukan AI tidak digunakan sebagai bukti verifikasi.");

    let status: VerificationResult["status"];
    let reason: string;
    if (conflictsExpected && !context.oracleAccepted) {
      status = "CONFLICTED";
      reason = "Kandidat bertentangan dengan expectedFlag yang diberikan.";
    } else if (context.oracleAccepted || matchesExpected) {
      status = "VERIFIED";
      reason = context.oracleAccepted
        ? "Kandidat diterima oleh oracle server atau verifikasi eksplisit konteks."
        : "Kandidat cocok persis dengan expectedFlag yang ditetapkan pengguna.";
    } else if (flagLike && inTerminal) {
      status = "POTENTIAL";
      reason = "Kandidat berformat flag dan didukung output terminal, tetapi belum ada oracle yang menerimanya.";
    } else {
      status = "UNVERIFIED";
      reason = "Tidak ada dukungan oracle, expectedFlag, atau output terminal nyata untuk kandidat ini.";
    }

    return {
      status,
      candidate: base,
      reason,
      evidence: evidence.slice(0, 5),
    };
  }
}
