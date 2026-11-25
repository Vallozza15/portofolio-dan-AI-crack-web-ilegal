import type { Intent } from "./types";

interface IntentRule {
  intent: Intent;
  phrases: string[];
  confidence: number;
  reason: string;
}

const RULES: IntentRule[] = [
  {
    intent: "REJECT_PREVIOUS_ANSWER",
    phrases: ["salah", "wrong", "reject", "not correct", "bukan jawaban itu", "Previous answer is wrong"],
    confidence: 0.94,
    reason: "Pesan menolak jawaban sebelumnya.",
  },
  {
    intent: "CORRECTION",
    phrases: ["koreksi", "correct", "seharusnya", "actually"],
    confidence: 0.9,
    reason: "Pesan meminta koreksi atas jawaban sebelumnya.",
  },
  {
    intent: "REQUEST_SHORT_ANSWER",
    phrases: ["only the flag", "just the flag", "kasih hanya", "jawab singkat", "short answer", "flag saja"],
    confidence: 0.9,
    reason: "Pesan meminta jawaban singkat.",
  },
  {
    intent: "REQUEST_DETAILED_ANSWER",
    phrases: ["detail", "lengkap", "explain fully", "step by step"],
    confidence: 0.88,
    reason: "Pesan meminta penjelasan lengkap.",
  },
  {
    intent: "REQUEST_VERIFICATION",
    phrases: ["are you sure", "verify", "check again", "yakin", "verifikasi", "cek ulang"],
    confidence: 0.88,
    reason: "Pesan meminta verifikasi ulang.",
  },
  {
    intent: "REQUEST_ALTERNATIVE",
    phrases: ["alternative", "another way", "cara lain", "different method", "strategi lain"],
    confidence: 0.86,
    reason: "Pesan meminta metode alternatif.",
  },
  {
    intent: "REQUEST_EXPLANATION",
    phrases: ["why", "kenapa", "mengapa", "explain", "jelaskan"],
    confidence: 0.82,
    reason: "Pesan meminta penjelasan.",
  },
  {
    intent: "CONTINUE_ANALYSIS",
    phrases: ["continue", "lanjut", "lanjutkan", "resume"],
    confidence: 0.85,
    reason: "Pesan meminta analisis dilanjutkan.",
  },
];

const FOLLOW_UP_PHRASES = ["this", "that", "itu", "ini", "previous", "sebelumnya", "then", "lalu", "dan"];

function normalizeMessage(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text: string, phrase: string): boolean {
  const target = normalizeMessage(phrase);
  if (!target) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(target)}([^a-z0-9]|$)`, "i");
  return pattern.test(text);
}

function evaluateRule(text: string, rule: IntentRule): { intent: Intent; confidence: number; reason: string } | null {
  let matches = 0;
  for (const phrase of rule.phrases) {
    if (hasPhrase(text, phrase)) matches += 1;
  }
  if (!matches) return null;
  const confidence = Math.min(0.95, Number((rule.confidence + (matches - 1) * 0.02).toFixed(2)));
  return { intent: rule.intent, confidence, reason: rule.reason };
}

export function classifyIntent(input: {
  message: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  previousChallengeId?: string;
  currentChallengeId?: string;
  language?: "id" | "en";
}): { intent: Intent; confidence: number; reason: string } {
  const text = normalizeMessage(input.message ?? "");

  for (const rule of RULES) {
    const matched = evaluateRule(text, rule);
    if (matched) return matched;
  }

  if (
    input.currentChallengeId &&
    input.previousChallengeId &&
    input.currentChallengeId !== input.previousChallengeId
  ) {
    return {
      intent: "NEW_CHALLENGE",
      confidence: 0.95,
      reason: "Challenge aktif berbeda dari challenge sebelumnya.",
    };
  }

  const hasAssistantHistory = (input.history ?? []).some(
    (entry) => entry.role === "assistant" && normalizeMessage(entry.content).length > 0,
  );
  if (hasAssistantHistory && FOLLOW_UP_PHRASES.some((phrase) => hasPhrase(text, phrase))) {
    return {
      intent: "FOLLOW_UP",
      confidence: 0.78,
      reason: "Pesan merujuk pada konteks percakapan sebelumnya.",
    };
  }

  if (text.includes("?") || hasPhrase(text, "what do you mean") || hasPhrase(text, "maksudnya")) {
    return {
      intent: "CLARIFICATION",
      confidence: 0.74,
      reason: "Pesan berupa pertanyaan klarifikasi.",
    };
  }

  return {
    intent: "NEW_QUESTION",
    confidence: 0.62,
    reason: "Pesan dianggap sebagai pertanyaan baru.",
  };
}
