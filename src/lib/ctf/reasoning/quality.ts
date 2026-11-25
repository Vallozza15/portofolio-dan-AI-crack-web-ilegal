import type { Intent, QualityCheck, QualityReport, RepetitionAnalysis } from "./types";

const ID_SECTIONS = [
  "IDENTIFIKASI",
  "ANALISIS AWAL",
  "TOOLS",
  "LANGKAH",
  "PROSES",
  "HASIL",
  "PEMBELAJARAN",
  "STATUS VERIFIKASI",
] as const;

const EN_SECTIONS = [
  "IDENTIFICATION",
  "INITIAL ANALYSIS",
  "TOOLS",
  "STEPS",
  "PROCESS",
  "RESULT",
  "LEARNING",
  "VERIFICATION STATUS",
] as const;

const STATUS_TOKENS = [
  "VERIFIED",
  "LIKELY",
  "INCOMPLETE",
  "UNSOLVED",
  "CONFIRMED",
  "HIGH CONFIDENCE",
  "PROBABLE",
  "UNVERIFIED",
] as const;

const STOPWORDS = new Set([
  "apa", "bagaimana", "dan", "dari", "ini", "itu", "jelaskan", "lengkap", "mengapa", "tentang",
  "the", "what", "when", "where", "which", "with", "your", "detail", "explain", "fully", "show",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasToken(text: string, token: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`);
  return pattern.test(text);
}

export function validateResponse(input: {
  answer: string;
  question: string;
  intent: Intent;
  language: "id" | "en";
  repetition: RepetitionAnalysis;
  shortAllowed: boolean;
  expectedSections?: boolean;
}): QualityReport {
  const answerNormalized = normalize(input.answer);
  const questionNormalized = normalize(input.question);
  const questionTokens = [...questionNormalized.matchAll(/[a-z0-9]{4,}/g)]
    .map((match) => match[0])
    .filter((token) => !STOPWORDS.has(token));
  const hasQuestionKeyword = questionTokens.some((token) => hasToken(answerNormalized, token));

  const answersLatestQuestion = answerNormalized.length > 0 && (hasQuestionKeyword || input.answer.length > 80);

  let followsFormat = true;
  if (!input.shortAllowed && input.expectedSections === true) {
    const sections = input.language === "en" ? EN_SECTIONS : ID_SECTIONS;
    followsFormat = sections.every((section) => answerNormalized.includes(normalize(section)));
  }

  const noUnnecessaryRepetition = !input.repetition.isUnnecessary;

  const needsStatusToken = input.expectedSections === true || !input.shortAllowed;
  const answerUpper = answerNormalized.toUpperCase();
  const evidenceDistinction = !needsStatusToken || STATUS_TOKENS.some((token) => answerUpper.includes(token));

  const checks: QualityCheck[] = [
    {
      name: "answersLatestQuestion",
      passed: answersLatestQuestion,
      detail: answersLatestQuestion
        ? "Jawaban memiliki kata kunci pertanyaan terbaru atau penjelasan yang cukup panjang."
        : "Jawaban tidak secara jelas menanggapi pertanyaan terbaru.",
    },
    {
      name: "followsFormat",
      passed: followsFormat,
      detail: followsFormat
        ? "Format jawaban sesuai dengan batasan yang diminta."
        : "Bagian wajib berformat delapan bagian belum lengkap.",
    },
    {
      name: "noUnnecessaryRepetition",
      passed: noUnnecessaryRepetition,
      detail: noUnnecessaryRepetition
        ? "Tidak ada pengulangan jawaban yang tidak perlu."
        : input.repetition.note,
    },
    {
      name: "evidenceDistinction",
      passed: evidenceDistinction,
      detail: evidenceDistinction
        ? "Pembedaan status bukti tersedia atau tidak diperlukan."
        : "Jawaban tidak mencantumkan status bukti atau keyakinan.",
    },
  ];

  const passed = checks.every((check) => check.passed);
  let answer = input.answer;
  if (!noUnnecessaryRepetition) {
    answer = `Konteks sebelumnya masih berlaku; berikut hanya bagian yang berubah.\n\n${answer}`;
  }
  if (!followsFormat && input.expectedSections === true) {
    answer = `${answer}\n\n> Catatan kontrol mutu: format delapan bagian tidak lengkap; jawaban perlu direview.`;
  }

  return {
    passed,
    checks,
    revised: answer !== input.answer,
    answer,
  };
}
