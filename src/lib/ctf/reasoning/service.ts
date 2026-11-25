import { extractFlagCandidates } from "../flag";
import {
  addHypothesisRecord,
  addIntentRecord,
  addReasoningCheck,
  addReasoningContext,
  listHypotheses,
  listToolRuns,
  newId,
  updateHypothesisRecord,
} from "../store";
import type { TerminalExecResult } from "../terminal";
import { execTerminal, type TerminalFile } from "../terminal";
import type {
  HypothesisRecord,
  IntentRecord,
  LocalAnalysisBundle,
  ReasoningCheckRecord,
  ReasoningContextRecord,
  ToolRun,
} from "../types";
import { analyzeRepetition, normalizeCommand } from "./anti-repetition";
import { REASONING_LIMITS } from "./config";
import { evaluateConfidence } from "./confidence";
import { buildConversationContext } from "./context";
import { crossValidate } from "./cross-validation";
import { buildHypotheses, scoreHypotheses } from "./hypothesis";
import { classifyIntent } from "./intent";
import { validateResponse } from "./quality";
import { buildRetryCommands } from "../strategies";
import type {
  ConfidenceAssessment,
  ConfidenceLevel,
  ContextSnapshot,
  CrossValidationResult,
  HypothesisDraft,
  Intent,
  RepetitionAnalysis,
} from "./types";

type HistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
};

export interface ReasoningEvidenceInput {
  source: string;
  detail: string;
}

export interface PreparedReasoning {
  intent: Intent;
  intentConfidence: number;
  intentReason: string;
  context: ContextSnapshot;
  repetition: RepetitionAnalysis;
  hypotheses: HypothesisDraft[];
  validation: CrossValidationResult;
  confidence: ConfidenceAssessment;
  extraEvidence: Array<{ title: string; summary: string; detail: string; confidence: string }>;
  extraInstructions: string;
  contextRecord: Omit<ReasoningContextRecord, "id" | "createdAt">;
  intentRecord: Omit<IntentRecord, "id" | "createdAt">;
}

export interface ReasoningEvent {
  type: "reasoning";
  requestId: string;
  conversationId: string;
  sessionId: string;
  intent: Intent;
  intentConfidence: number;
  intentReason: string;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  hypotheses: Array<{
    id: string;
    description: string;
    status: string;
    confidence: number;
  }>;
  repetition: string;
  note: string;
}

function toShortAnswer(answer: string, confidence: ConfidenceAssessment): string {
  const candidate = extractFlagCandidates(answer, "jawaban singkat")[0]?.value;
  const status = `${confidence.level} (${Math.round(confidence.score * 100)}%)`;
  if (candidate) return `Flag: ${candidate} — status ${status}.`;

  const cleaned = answer
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\s*[-*]\s*/, "")
        .replace(/^\*\*[^*]+\*\*\s*:?/, "")
        .trim(),
    )
    .filter((line) => line && !line.startsWith("---") && line.length > 3)
    .join(" ");
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.slice(0, 240);
  const core =
    firstSentence || "Analisis belum menghasilkan kandidat yang dapat diverifikasi.";
  return `${core} Status: ${status}.`;
}

const INTENT_NOTES: Record<Intent, string> = {
  NEW_QUESTION: "Jawab pertanyaan ini dari bukti yang tersedia; jangan mengulang jawaban lama tanpa perlu.",
  FOLLOW_UP: "Lanjutkan dari konteks sebelumnya. Ulangi hanya fakta yang berubah.",
  CONTINUE_ANALYSIS: "Lanjutkan analisis yang belum selesai dan jelaskan langkah berikutnya.",
  REQUEST_ALTERNATIVE: "Jangan ulangi metode yang sudah gagal. Tawarkan strategi yang benar-benar berbeda.",
  REQUEST_VERIFICATION: "Periksa ulang klaim sebelumnya hanya dengan bukti nyata; bedakan fakta dan dugaan.",
  REQUEST_EXPLANATION: "Jelaskan alasan dan proses, bukan hanya kesimpulan.",
  REQUEST_SHORT_ANSWER: "Jawab singkat dan langsung, tanpa laporan delapan bagian.",
  REQUEST_DETAILED_ANSWER: "Berikan penjelasan lengkap dengan langkah yang dapat diverifikasi.",
  CORRECTION: "Perbaiki jawaban sebelumnya secara eksplisit dan sebutkan bagian yang salah.",
  REJECT_PREVIOUS_ANSWER: "Tolak kesimpulan sebelumnya, lalu susun ulang dari bukti yang ada.",
  NEW_CHALLENGE: "Anggap ini challenge baru; jangan mewarisi hipotesis challenge sebelumnya.",
  CLARIFICATION: "Jika informasi kurang, ajukan satu pertanyaan klarifikasi yang paling penting.",
};

export class IntentClassifier {
  classify(input: {
    message: string;
    history?: HistoryMessage[];
    previousChallengeId?: string;
    currentChallengeId?: string;
    language?: "id" | "en";
  }) {
    return classifyIntent(input);
  }
}

export class ConversationContextManager {
  build(input: {
    sessionId: string;
    requestId: string;
    messages: HistoryMessage[];
    toolRuns: ToolRun[];
    hypotheses: HypothesisRecord[];
    evidence: Array<{ title: string; summary: string }>;
    question: string;
    challengeId?: string;
  }): ContextSnapshot {
    return buildConversationContext({
      sessionId: input.sessionId,
      requestId: input.requestId,
      messages: input.messages,
      toolRuns: input.toolRuns.map((run) => ({
        command: run.args[0],
        purpose: run.purpose,
        status: run.status,
        summary: run.summary,
        createdAt: run.createdAt,
      })),
      hypotheses: input.hypotheses.map((item) => ({
        hypothesisId: item.hypothesisId,
        description: item.description,
        confidence: item.confidence,
        status: item.status,
      })),
      evidence: input.evidence.map((item) => ({ title: item.title, summary: item.summary })),
      question: input.question,
      challengeId: input.challengeId,
    });
  }

  async loadToolHistory(sessionId: string): Promise<ToolRun[]> {
    return listToolRuns(sessionId);
  }
}

export class AntiRepetitionEngine {
  analyze(input: {
    proposed: string;
    previousAnswers: string[];
    previousCommands: string[];
    failedCommands?: string[];
    essential?: boolean;
    intent?: Intent;
  }): RepetitionAnalysis {
    const essential =
      input.essential ||
      input.intent === "REQUEST_VERIFICATION" ||
      input.intent === "REQUEST_EXPLANATION" ||
      input.intent === "CONTINUE_ANALYSIS";
    return analyzeRepetition({
      proposed: input.proposed,
      previousAnswers: input.previousAnswers,
      previousCommands: input.previousCommands,
      failedCommands: input.failedCommands,
      threshold: REASONING_LIMITS.similarityThreshold,
      essential,
    });
  }
}

export class HypothesisManager {
  build(input: {
    category?: string;
    files?: Array<{ name: string; magic?: string }>;
    question: string;
    previousFailures?: string[];
    language?: "id" | "en";
  }): HypothesisDraft[] {
    return buildHypotheses(input);
  }

  score(input: {
    hypotheses: HypothesisDraft[];
    evidenceTexts: string[];
    failures?: string[];
    flagFormat?: string;
    expectedFlag?: string;
  }): HypothesisDraft[] {
    return scoreHypotheses(input);
  }
}

export class StrategyPlanner {
  cap(commands: string[], reason: string): { commands: string[]; reason: string } {
    const seen = new Set<string>();
    const capped: string[] = [];
    for (const command of inputCommands(commands)) {
      const key = normalizeCommand(command);
      if (seen.has(key)) continue;
      seen.add(key);
      capped.push(command);
      if (capped.length >= REASONING_LIMITS.maxStrategies) break;
    }
    return { commands: capped, reason };
  }

  fallback(cycle: number, files: TerminalFile[], tools: string[], used: string[]): string[] {
    const seen = new Set(used.map(normalizeCommand));
    const retry = buildRetryCommands(cycle, files, tools).filter(
      (command) => !seen.has(normalizeCommand(command)),
    );
    return retry.slice(0, REASONING_LIMITS.maxStrategies);
  }
}

function inputCommands(value: string[]): string[] {
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export class KaliTerminalExecutor {
  async execute(
    input: Parameters<typeof execTerminal>[0] & {
      requestId?: string;
      purpose?: string;
      hypothesisId?: string;
      phase?: string;
    },
  ): Promise<TerminalExecResult> {
    return execTerminal(input);
  }
}

export class ExecutionHistoryManager {
  summarize(runs: ToolRun[]): {
    commands: string[];
    failedCommands: string[];
    lastResult?: string;
  } {
    const commands: string[] = [];
    const failedCommands: string[] = [];
    for (const run of [...runs].reverse()) {
      const command = run.args[0];
      if (!command) continue;
      if (!commands.some((item) => normalizeCommand(item) === normalizeCommand(command))) {
        commands.push(command);
      }
      if ((run.status === "error" || run.status === "blocked") && !failedCommands.includes(command)) {
        failedCommands.push(command);
      }
    }
    return {
      commands: commands.slice(0, 40),
      failedCommands: failedCommands.slice(0, 20),
      lastResult: runs[0]?.summary,
    };
  }
}

export class EvidenceCollector {
  collect(
    bundle: LocalAnalysisBundle | undefined,
    stored: Array<{ title: string; summary: string; detail?: string }>,
    terminal: ReasoningEvidenceInput[],
  ): Array<{ source: string; detail: string }> {
    const entries: Array<{ source: string; detail: string }> = [];
    for (const evidence of bundle?.evidence || []) {
      entries.push({ source: `upload: ${evidence.title}`, detail: evidence.detail || evidence.summary });
    }
    for (const item of stored) {
      entries.push({ source: `bukti: ${item.title}`, detail: item.detail || item.summary });
    }
    for (const item of terminal) {
      entries.push({ source: `kali: ${item.source}`, detail: item.detail });
    }
    return entries;
  }

  toAssistantEvidence(
    items: Array<{ title: string; summary: string; detail: string; confidence?: string }>,
  ): Array<{ title: string; summary: string; detail: string; confidence: string }> {
    return items.map((item) => ({
      title: item.title,
      summary: item.summary,
      detail: item.detail,
      confidence: item.confidence || "medium",
    }));
  }
}

export class CrossValidationEngine {
  validate(input: Parameters<typeof crossValidate>[0]): CrossValidationResult {
    return crossValidate(input);
  }
}

export class ConfidenceEvaluator {
  evaluate(input: Parameters<typeof evaluateConfidence>[0]): ConfidenceAssessment {
    return evaluateConfidence(input);
  }
}

export class AnswerGenerator {
  instructions(intent: Intent, repetition: RepetitionAnalysis, shortAllowed: boolean): string {
    const lines = [INTENT_NOTES[intent]];
    if (shortAllowed) lines.push("Batasi jawaban maksimal tiga kalimat dan sertakan status keyakinan.");
    if (repetition.mustReferencePrevious) {
      lines.push("Jangan mengulang penjelasan lama; nyatakan hanya perubahan atau kesimpulan baru.");
    }
    return lines.join("\n");
  }
}

export class ResponseQualityController {
  check(input: Parameters<typeof validateResponse>[0]) {
    return validateResponse(input);
  }
}

export class ReasoningPipeline {
  private readonly intents = new IntentClassifier();
  private readonly contexts = new ConversationContextManager();
  private readonly repetition = new AntiRepetitionEngine();
  private readonly hypotheses = new HypothesisManager();
  private readonly evidenceCollector = new EvidenceCollector();
  private readonly validation = new CrossValidationEngine();
  private readonly confidence = new ConfidenceEvaluator();
  private readonly answers = new AnswerGenerator();
  private readonly quality = new ResponseQualityController();

  prepare(input: {
    sessionId: string;
    requestId: string;
    question: string;
    messages: HistoryMessage[];
    toolRuns: ToolRun[];
    hypotheses: HypothesisRecord[];
    evidence: Array<{ title: string; summary: string; detail?: string }>;
    bundle?: LocalAnalysisBundle;
    terminalEvidence?: ReasoningEvidenceInput[];
    language: "id" | "en";
    previousChallengeId?: string;
  }): PreparedReasoning {
    const currentChallengeId = input.bundle?.challenge.id;
    const classified = this.intents.classify({
      message: input.question,
      history: input.messages.slice(0, -1),
      previousChallengeId: input.previousChallengeId,
      currentChallengeId: currentChallengeId,
      language: input.language,
    });
    const context = this.contexts.build({
      sessionId: input.sessionId,
      requestId: input.requestId,
      messages: input.messages,
      toolRuns: input.toolRuns,
      hypotheses: input.hypotheses,
      evidence: input.evidence,
      question: input.question,
      challengeId: currentChallengeId,
    });
    const history = this.contexts.build({
      sessionId: input.sessionId,
      requestId: input.requestId,
      messages: input.messages.slice(0, -1),
      toolRuns: [],
      hypotheses: [],
      evidence: [],
      question: input.question,
      challengeId: currentChallengeId,
    });
    const repetition = this.repetition.analyze({
      proposed: input.question,
      previousAnswers: [...history.previousQuestions, ...history.previousAnswers],
      previousCommands: context.attemptedMethods,
      failedCommands: context.failedApproaches,
      intent: classified.intent,
    });
    const evidenceEntries = this.evidenceCollector.collect(
      input.bundle,
      input.evidence,
      input.terminalEvidence || [],
    );
    const evidenceTexts = evidenceEntries.map((item) => `${item.source}: ${item.detail}`);
    let hypotheses = this.hypotheses.build({
      category: input.bundle?.category,
      files: (input.bundle?.files || []).map((file) => ({
        name: file.name,
        magic: file.embedded?.[0]?.label,
      })),
      question: input.question,
      previousFailures: context.failedApproaches,
      language: input.language,
    });
    hypotheses = this.hypotheses.score({
      hypotheses,
      evidenceTexts,
      failures: context.failedApproaches,
      flagFormat: input.bundle?.challenge.flagFormat,
      expectedFlag: input.bundle?.challenge.expectedFlag,
    });

    const flagFormat = input.bundle?.challenge.flagFormat;
    const candidates = evidenceEntries.flatMap((item) =>
      extractFlagCandidates(item.detail, item.source, flagFormat).map((candidate) => ({
        value: candidate.value,
        source: item.source,
      })),
    );
    const rawValidation = this.validation.validate({
      evidence: evidenceEntries,
      challenge: {
        flagFormat,
        expectedFlag: input.bundle?.challenge.expectedFlag,
      },
    });
    const expected = input.bundle?.challenge.expectedFlag?.trim() || "";
    const terminalExpected = Boolean(
      expected && candidates.some(
        (item) => item.value === expected && item.source.startsWith("kali:"),
      ),
    );
    // An expected flag found only in prose/upload analysis is not verification.
    const validation: CrossValidationResult =
      expected && !terminalExpected && rawValidation.confidence === "CONFIRMED"
        ? {
            ...rawValidation,
            confidence: "INCORRECT",
            summary:
              "Expected flag hanya muncul di bukti statis; belum direproduksi dari eksekusi Kali nyata.",
          }
        : rawValidation;
    const terminalSources = new Set(
      candidates.filter((item) => item.source.startsWith("kali:")).map((item) => item.source),
    ).size;
    const confidenceCandidates = expected
      ? candidates.filter((item) => item.source.startsWith("kali:") || item.value !== expected)
      : candidates;
    const confidence = this.confidence.evaluate({
      expectedFlag: expected || undefined,
      candidates: confidenceCandidates,
      agreements: validation.agreements.length,
      conflicts: validation.conflicts.length,
      terminalSources,
    });

    const shortAllowed = classified.intent === "REQUEST_SHORT_ANSWER";
    const hypothesisLines = hypotheses
      .slice(0, 5)
      .map(
        (item) =>
          `- ${item.id} (${item.status}, ${Math.round(item.confidence * 100)}%): ${item.description}`,
      )
      .join("\n");
    const extraEvidence = [
      {
        title: "Konteks percakapan dan riwayat investigasi",
        summary: context.summaryText.slice(0, 500),
        detail: context.summaryText,
        confidence: "medium",
      },
      {
        title: "Hipotesis aktif dan penilaian bukti",
        summary: hypothesisLines.slice(0, 500),
        detail: hypothesisLines,
        confidence: "medium",
      },
      {
        title: "Validasi silang dan tingkat keyakinan",
        summary: `${validation.summary} Keyakinan: ${confidence.level} (${Math.round(confidence.score * 100)}%).`,
        detail: `${validation.summary}\n${confidence.note}\nSetuju: ${validation.agreements.map((item) => item.value).join(", ") || "—"}\nBertentangan: ${validation.conflicts.map((item) => item.value).join(", ") || "—"}`,
        confidence: "medium",
      },
    ];
    const extraInstructions = [
      this.answers.instructions(classified.intent, repetition, shortAllowed),
      `Niat terdeteksi: ${classified.intent}. Gunakan konteks sebelumnya hanya jika relevan.`,
      "Jangan mengarang flag, output terminal, hash, atau verifikasi. Status VERIFIED hanya jika expected flag benar-benar terbukti dari eksekusi nyata atau platform.",
    ].join("\n");

    return {
      intent: classified.intent,
      intentConfidence: classified.confidence,
      intentReason: classified.reason,
      context,
      repetition,
      hypotheses,
      validation,
      confidence,
      extraEvidence,
      extraInstructions,
      contextRecord: {
        sessionId: input.sessionId,
        conversationId: input.sessionId,
        challengeId: currentChallengeId,
        requestId: input.requestId,
        intent: classified.intent,
        question: input.question,
        previousQuestions: context.previousQuestions,
        previousAnswers: context.previousAnswers,
        attemptedMethods: context.attemptedMethods,
        failedApproaches: context.failedApproaches,
        confirmedFindings: context.confirmedFindings,
        unresolvedQuestions: context.unresolvedQuestions,
        challengeState: context.challengeState,
        summary: context.summaryText,
      },
      intentRecord: {
        sessionId: input.sessionId,
        challengeId: currentChallengeId,
        requestId: input.requestId,
        intent: classified.intent,
        confidence: classified.confidence,
        reason: classified.reason,
      },
    };
  }

  async persist(
    prepared: PreparedReasoning,
    messageId?: string,
  ): Promise<{ hypothesisIds: string[] }> {
    await addReasoningContext({ ...prepared.contextRecord, messageId });
    await addIntentRecord(prepared.intentRecord);
    const hypothesisIds: string[] = [];
    for (const item of prepared.hypotheses) {
      const record = await addHypothesisRecord({
        sessionId: prepared.contextRecord.sessionId,
        challengeId: prepared.contextRecord.challengeId,
        requestId: prepared.contextRecord.requestId,
        hypothesisId: item.id,
        description: item.description,
        supportingEvidence: item.supportingEvidence,
        contradictingEvidence: item.contradictingEvidence,
        requiredTests: item.requiredTests,
        confidence: item.confidence,
        status: item.status,
      });
      hypothesisIds.push(record.id);
    }
    return { hypothesisIds };
  }

  async finalize(input: {
    prepared: PreparedReasoning;
    answer: string;
    question: string;
    language: "id" | "en";
    shortAllowed: boolean;
    expectedSections?: boolean;
  }): Promise<{ answer: string; revised: boolean; checks: ReasoningCheckRecord["checks"] }> {
    const report = this.quality.check({
      answer: input.answer,
      question: input.question,
      intent: input.prepared.intent,
      language: input.language,
      repetition: input.prepared.repetition,
      shortAllowed: input.shortAllowed,
      expectedSections: input.expectedSections,
    });
    const finalAnswer = input.shortAllowed
      ? toShortAnswer(report.answer, input.prepared.confidence)
      : report.answer;
    const revised = report.revised || finalAnswer !== input.answer;
    await addReasoningCheck({
      sessionId: input.prepared.contextRecord.sessionId,
      challengeId: input.prepared.contextRecord.challengeId,
      requestId: input.prepared.contextRecord.requestId,
      intent: input.prepared.intent,
      confidence: input.prepared.confidence.level,
      score: input.prepared.confidence.score,
      agreements: input.prepared.validation.agreements.map((item) => item.value),
      conflicts: input.prepared.validation.conflicts.map((item) => item.value),
      checks: report.checks,
      passed: report.passed,
      revised,
      note: `${input.prepared.confidence.note} ${input.prepared.validation.summary}`,
    });
    return { answer: finalAnswer, revised, checks: report.checks };
  }

  event(prepared: PreparedReasoning, sessionId: string): ReasoningEvent {
    return {
      type: "reasoning",
      requestId: prepared.contextRecord.requestId,
      conversationId: prepared.contextRecord.conversationId,
      sessionId,
      intent: prepared.intent,
      intentConfidence: prepared.intentConfidence,
      intentReason: prepared.intentReason,
      confidence: prepared.confidence.level,
      confidenceScore: prepared.confidence.score,
      hypotheses: prepared.hypotheses.slice(0, 5).map((item) => ({
        id: item.id,
        description: item.description,
        status: item.status,
        confidence: item.confidence,
      })),
      repetition: prepared.repetition.note,
      note: `${prepared.intentReason} ${prepared.confidence.note}`,
    };
  }
}

/** Re-score persisted hypotheses once a real terminal result is available. */
export async function rescoreHypothesesFromOutput(input: {
  sessionId: string;
  requestId: string;
  outputText: string;
  failures?: string[];
  flagFormat?: string;
  expectedFlag?: string;
}): Promise<HypothesisDraft[]> {
  const records = await listHypotheses(input.sessionId, input.requestId);
  if (!records.length) return [];
  const manager = new HypothesisManager();
  const scored = manager.score({
    hypotheses: records.map((record) => ({
      id: record.hypothesisId,
      description: record.description,
      supportingEvidence: [...record.supportingEvidence],
      contradictingEvidence: [...record.contradictingEvidence],
      requiredTests: [...record.requiredTests],
      confidence: record.confidence,
      status: record.status,
    })),
    evidenceTexts: [`output terminal: ${input.outputText}`],
    failures: input.failures,
    flagFormat: input.flagFormat,
    expectedFlag: input.expectedFlag,
  });
  for (const item of scored) {
    const record = records.find((entry) => entry.hypothesisId === item.id);
    if (!record) continue;
    await updateHypothesisRecord(record.id, {
      supportingEvidence: item.supportingEvidence,
      contradictingEvidence: item.contradictingEvidence,
      confidence: item.confidence,
      status: item.status,
    });
  }
  return scored;
}

/** Used by the agent route to mark a hypothesis after real terminal output. */
export async function updateHypothesesFromExecution(
  sessionId: string,
  requestId: string,
  output: string,
): Promise<void> {
  const records = await listHypotheses(sessionId, requestId);
  for (const record of records) {
    const mentions = output.toLowerCase().includes(record.description.toLowerCase().slice(0, 40));
    if (!mentions) continue;
    await updateHypothesisRecord(record.id, {
      status: "testing",
      supportingEvidence: [
        ...record.supportingEvidence,
        `output terminal: ${output.slice(0, 120)}`,
      ].slice(-5),
      confidence: Math.min(1, record.confidence + 0.1),
    });
  }
}

/** Public request id generator shared by both chat routes. */
export function nextRequestId(): string {
  return newId("req");
}
