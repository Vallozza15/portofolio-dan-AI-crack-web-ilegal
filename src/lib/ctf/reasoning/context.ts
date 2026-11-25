import type { ContextSnapshot } from "./types";

function clip(value: string, max = 200): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function joinForSummary(values: string[]): string {
  if (values.length === 0) return "-";
  return values.map((value) => clip(value, 160)).join("; ");
}

const CONFIRMATION_PATTERN =
  /(terverifikasi|terkonfirmasi|dikonfirmasi|confirmed|verified|valid|cocok|berhasil|ditemukan|ketemu|high confidence|keyakinan tinggi)/i;

const STATE_PATTERNS: Array<{ pattern: RegExp; state: string }> = [
  { pattern: /\b(terverifikasi|verified|selesai|solved|flag ditemukan)\b/i, state: "terverifikasi" },
  { pattern: /\b(likely|kemungkinan besar|kandidat kuat)\b/i, state: "kandidat kuat" },
  { pattern: /\b(incomplete|belum lengkap|sebagian)\b/i, state: "bukti belum lengkap" },
  { pattern: /\b(unsolved|belum terselesaikan|tidak ada kandidat)\b/i, state: "belum terselesaikan" },
];

function detectChallengeState(lastAssistant: string | undefined): string {
  const text = (lastAssistant ?? "").replace(/\s+/g, " ").trim();
  for (const entry of STATE_PATTERNS) {
    if (entry.pattern.test(text)) return entry.state;
  }
  return "investigasi berjalan";
}

export function buildConversationContext(input: {
  sessionId: string;
  requestId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string; createdAt?: string }>;
  toolRuns: Array<{ command?: string; purpose?: string; status?: string; summary?: string; createdAt?: string }>;
  hypotheses: Array<{ hypothesisId: string; description: string; confidence: number; status: string }>;
  evidence: Array<{ title: string; summary: string }>;
  question: string;
  challengeId?: string;
}): ContextSnapshot {
  const previousQuestions = input.messages
    .filter((message) => message.role === "user")
    .slice(-12)
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  const previousAnswers = input.messages
    .filter((message) => message.role === "assistant")
    .slice(-12)
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  const attemptedSet = new Set<string>();
  for (const run of input.toolRuns) {
    const command = run.command?.trim() ?? "";
    const purpose = run.purpose?.trim() ?? "";
    const label = command && purpose ? `${command} — ${purpose}` : command || purpose;
    if (label) attemptedSet.add(clip(label, 160));
  }
  const attemptedMethods = [...attemptedSet].slice(-20);

  const failedSet = new Set<string>();
  for (const run of input.toolRuns) {
    const status = (run.status ?? "").toLowerCase().trim();
    if (status !== "error" && status !== "blocked") continue;
    const method = run.command?.trim() || run.purpose?.trim() || "perintah tanpa label";
    const detail = run.summary?.trim();
    const line = detail ? `${method}: ${clip(detail, 160)}` : method;
    failedSet.add(line);
  }
  const failedApproaches = [...failedSet].slice(-20);

  const confirmedSet = new Set<string>();
  for (const item of input.evidence) {
    const title = item.title.trim();
    const summary = item.summary.trim();
    if (!CONFIRMATION_PATTERN.test(`${title} ${summary}`)) continue;
    const line = title && summary ? `${title}: ${summary}` : title || summary;
    const clipped = clip(line, 200);
    if (clipped) confirmedSet.add(clipped);
  }
  const confirmedFindings = [...confirmedSet].slice(0, 12);

  const unresolvedQuestions = input.hypotheses
    .filter((hypothesis) => /^(open|testing)$/i.test(hypothesis.status.trim()))
    .map((hypothesis) => `${hypothesis.hypothesisId}: ${clip(hypothesis.description, 160)}`)
    .slice(0, 12);

  const lastAssistant = [...input.messages].reverse().find((message) => message.role === "assistant");
  const challengeState = detectChallengeState(lastAssistant?.content);

  const summaryText = [
    `Sudah dijelaskan: ${joinForSummary(previousAnswers)}`,
    `Sudah dicoba: ${joinForSummary(attemptedMethods)}`,
    `Gagal: ${joinForSummary(failedApproaches)}`,
    `Dikonfirmasi: ${joinForSummary(confirmedFindings)}`,
    `Masih terbuka: ${joinForSummary(unresolvedQuestions)}`,
    `Pertanyaan terbaru: ${clip(input.question, 240) || "-"}`,
  ].join("\n");

  return {
    sessionId: input.sessionId,
    requestId: input.requestId,
    challengeId: input.challengeId,
    question: input.question,
    previousQuestions,
    previousAnswers,
    attemptedMethods,
    failedApproaches,
    confirmedFindings,
    unresolvedQuestions,
    challengeState,
    summaryText,
  };
}
