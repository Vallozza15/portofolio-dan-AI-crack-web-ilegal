import type {
  ChallengeFinalStatus,
  CompletionContext,
  CompletionResult,
} from "./types";

const CONTINUATION_RE = /\b(next\s+stage|tahap\s+(?:berikutnya|selanjutnya)|continue|lanjut|another\s+(?:stage|step|part)|masih\s+ada|belum\s+selesai|not\s+(?:done|finished)|need\s+more|perlu\s+lagi)\b/i;

export class ChallengeCompletionDetector {
  detect(context: CompletionContext): CompletionResult {
    const signals = [...context.continuationSignals];
    for (const text of [...context.hintTexts, ...context.observationTexts]) {
      const match = CONTINUATION_RE.exec(text);
      if (match && !signals.includes(match[0])) signals.push(match[0]);
    }

    const unresolved = context.unresolvedTasks.filter((task) => task.trim().length > 0);
    const verification = context.verification;
    const flag = verification.candidate?.value;
    const verified = verification.status === "VERIFIED";
    const completed = verified && signals.length === 0 && unresolved.length === 0;

    let status: ChallengeFinalStatus;
    if (completed) {
      status = "COMPLETED";
    } else if (verified) {
      status = "VERIFIED";
    } else if (verification.status === "POTENTIAL") {
      status = "POTENTIAL_FLAG";
    } else if (context.stage > 1 || signals.length > 0 || verification.status === "CONFLICTED") {
      status = "INTERMEDIATE";
    } else {
      status = "UNSOLVED";
    }

    let reason: string;
    if (completed) {
      reason = "Flag terverifikasi dan tidak ada tugas atau sinyal lanjutan yang tersisa.";
    } else if (signals.length) {
      reason = `Sinyal lanjutan masih ada (${signals.slice(0, 2).join("; ")}), sehingga challenge belum selesai.`;
    } else if (unresolved.length) {
      reason = `Masih ada ${unresolved.length} tugas yang belum terselesaikan.`;
    } else if (verified) {
      reason = "Flag terverifikasi, tetapi status akhir belum ditandai selesai oleh konteks.";
    } else {
      reason = verification.reason;
    }

    return {
      status,
      completed,
      reason,
      continuationSignals: signals,
      ...(flag ? { flag } : {}),
    };
  }
}
