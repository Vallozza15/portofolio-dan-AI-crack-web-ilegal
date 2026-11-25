import {
  generateLocalAssistantReply,
  type AiChatMessage,
  type AssistantStreamEvent,
} from "./ai";
import { extractFlagCandidates } from "./flag";
import type { LocalAnalysisBundle, ProviderId, SessionMode } from "./types";

const SECTIONS_ID = [
  "1. IDENTIFIKASI",
  "2. ANALISIS AWAL",
  "3. TOOLS",
  "4. LANGKAH",
  "5. PROSES",
  "6. HASIL",
  "7. PEMBELAJARAN",
  "8. STATUS VERIFIKASI",
];

const SECTIONS_EN = [
  "1. IDENTIFICATION",
  "2. INITIAL ANALYSIS",
  "3. TOOLS",
  "4. STEPS",
  "5. PROCESS",
  "6. RESULT",
  "7. LEARNING",
  "8. VERIFICATION STATUS",
];

export function hasRequiredSections(text: string, language: "id" | "en"): boolean {
  const sections = language === "en" ? SECTIONS_EN : SECTIONS_ID;
  return sections.every((section) => text.includes(section));
}

type AnswerEvidence = {
  title: string;
  summary: string;
  detail: string;
  confidence: string;
};

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * Deterministic final answer used when the LLM output is missing or incomplete.
 * The file analysis report alone does not include Kali terminal output, so the
 * real commands are appended explicitly when this is an agent run.
 */
function buildDeterministicAnswer(input: {
  messages: AiChatMessage[];
  bundle?: LocalAnalysisBundle;
  mode: SessionMode;
  language: "id" | "en";
  extraEvidence?: AnswerEvidence[];
}): string {
  const base = generateLocalAssistantReply(input);
  const terminal = (input.extraEvidence || []).filter((item) =>
    item.title.startsWith("Kali:"),
  );
  if (!terminal.length || base.includes("Output terminal Kali") || base.includes("Kali terminal output")) {
    return base;
  }
  const flagFormat = input.bundle?.challenge.flagFormat;
  const appendix = terminal
    .map((item) => {
      const values = extractFlagCandidates(item.detail, flagFormat)
        .map((candidate) => `\`${candidate.value}\``)
        .join(", ");
      return `### ${item.title}\n\n${truncate(item.detail, 1200)}\n\nKandidat dari output nyata: ${values || "—"}`;
    })
    .join("\n\n");
  return `${base}\n\n---\n\n### Lampiran — bukti eksekusi Kali (benar-benar dijalankan)\n\n${appendix}`;
}

/**
 * Small local models frequently ignore the mandatory 8-section format. This
 * keeps the streamed answer honest and structured: when the model output is
 * incomplete, the final report is rebuilt deterministically from the same
 * real evidence that was already collected.
 */
export function ensureStructuredAnswer(input: {
  streamed: AssistantStreamEvent[];
  full: string;
  messages: AiChatMessage[];
  bundle?: LocalAnalysisBundle;
  mode: SessionMode;
  language: "id" | "en";
  extraEvidence?: AnswerEvidence[];
  provider: ProviderId;
  model: string;
  /** Short answers are allowed to skip the mandatory 8-section report. */
  allowShort?: boolean;
}): {
  streamed: AssistantStreamEvent[];
  full: string;
  provider: ProviderId;
  model: string;
  rebuilt: boolean;
} {
  const { streamed, full, messages, bundle, mode, language, extraEvidence } = input;
  if (input.allowShort && full.trim()) {
    return {
      streamed,
      full,
      provider: input.provider,
      model: input.model,
      rebuilt: false,
    };
  }
  if (full.trim() && hasRequiredSections(full, language)) {
    return {
      streamed,
      full,
      provider: input.provider,
      model: input.model,
      rebuilt: false,
    };
  }

  const deterministic = buildDeterministicAnswer({
    messages,
    bundle,
    mode,
    language,
    extraEvidence,
  });
  const events: AssistantStreamEvent[] = [
    { type: "meta", provider: "local", model: "deterministic-engine" },
  ];
  for (let index = 0; index < deterministic.length; index += 220) {
    events.push({ type: "delta", text: deterministic.slice(index, index + 220) });
  }
  events.push({ type: "done" });
  return {
    streamed: events,
    full: deterministic,
    provider: "local",
    model: "deterministic-engine",
    rebuilt: true,
  };
}
