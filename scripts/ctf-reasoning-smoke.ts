import assert from "node:assert/strict";
import { analyzeRepetition, cosineSimilarity, embedText, normalizeCommand, normalizeText } from "../src/lib/ctf/reasoning/anti-repetition";
import { evaluateConfidence } from "../src/lib/ctf/reasoning/confidence";
import { buildConversationContext } from "../src/lib/ctf/reasoning/context";
import { crossValidate } from "../src/lib/ctf/reasoning/cross-validation";
import { classifyIntent } from "../src/lib/ctf/reasoning/intent";
import { buildHypotheses, scoreHypotheses } from "../src/lib/ctf/reasoning/hypothesis";
import { validateResponse } from "../src/lib/ctf/reasoning/quality";
import { createSerialQueue } from "../src/lib/ctf/reasoning/queue";
import { INTENTS, type RepetitionAnalysis } from "../src/lib/ctf/reasoning/types";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function cleanRepetition(): RepetitionAnalysis {
  return {
    similarity: 0,
    repeatedAnswerIndexes: [],
    duplicateCommands: [],
    isUnnecessary: false,
    mustReferencePrevious: false,
    note: "Tidak ada pengulangan yang berarti terdeteksi.",
  };
}

function testIntents(): void {
  assert.equal(INTENTS.length, 12);
  assert.ok(INTENTS.includes("NEW_QUESTION"));

  const history = [{ role: "assistant" as const, content: "Analisis sebelumnya menemukan kandidat." }];
  const cases: Array<{ message: string; expected: string; extra?: Record<string, string> }> = [
    { message: "Only the flag", expected: "REQUEST_SHORT_ANSWER" },
    { message: "Coba cara lain ya", expected: "REQUEST_ALTERNATIVE" },
    { message: "Are you sure?", expected: "REQUEST_VERIFICATION" },
    { message: "Itu salah", expected: "REJECT_PREVIOUS_ANSWER" },
    { message: "koreksi bagian proses", expected: "CORRECTION" },
    { message: "Lalu apa hasilnya untuk itu?", expected: "FOLLOW_UP" },
    { message: "Analisis challenge berikut.", expected: "NEW_CHALLENGE", extra: { previousChallengeId: "ch1", currentChallengeId: "ch2" } },
    { message: "Tolong periksa file lampiran.", expected: "NEW_QUESTION" },
  ];

  for (const item of cases) {
    const result = classifyIntent({
      message: item.message,
      history: item.expected === "FOLLOW_UP" || item.expected === "REJECT_PREVIOUS_ANSWER" || item.expected === "CORRECTION" ? history : undefined,
      previousChallengeId: item.extra?.previousChallengeId,
      currentChallengeId: item.extra?.currentChallengeId,
    });
    assert.equal(result.intent, item.expected, item.message);
    assert.ok(result.confidence >= 0.6 && result.confidence <= 0.95, item.message);
    assert.ok(result.reason.length > 0, item.message);
  }
}

function testAntiRepetition(): void {
  assert.equal(normalizeText("  Halo   DUNIA\n"), "halo dunia");
  assert.equal(normalizeCommand('  "strings   -a"  '), "strings -a");

  const first = embedText("flag adalah flag{abc} dan xor xor");
  const same = embedText("flag adalah flag{abc} dan xor xor");
  const different = embedText("cuaca hujan di kota bandung hari ini cerah");
  assert.ok(cosineSimilarity(first, same) > 0.9);
  assert.ok(cosineSimilarity(first, different) < 0.5);

  const identical = analyzeRepetition({
    proposed: "Flag: flag{abc}",
    previousAnswers: ["Flag: flag{abc}"],
    previousCommands: [],
  });
  assert.ok(identical.similarity > 0.9);
  assert.deepEqual(identical.repeatedAnswerIndexes, [0]);
  assert.equal(identical.isUnnecessary, true);
  assert.equal(identical.mustReferencePrevious, true);

  const essential = analyzeRepetition({
    proposed: "Flag: flag{abc}",
    previousAnswers: ["Flag: flag{abc}"],
    previousCommands: [],
    essential: true,
  });
  assert.ok(essential.similarity > 0.9);
  assert.equal(essential.isUnnecessary, false);
  assert.equal(essential.mustReferencePrevious, false);

  const duplicate = analyzeRepetition({
    proposed: "Sudah menjalankan strings -a",
    previousAnswers: [],
    previousCommands: ["'strings -a'"],
    failedCommands: ["strings -a", "strings -a"],
  });
  assert.deepEqual(duplicate.duplicateCommands, ["strings -a"]);
  assert.equal(duplicate.isUnnecessary, true);
}

function testContext(): void {
  const snapshot = buildConversationContext({
    sessionId: "s1",
    requestId: "r1",
    messages: [
      { role: "user", content: "Apa format flagnya?" },
      { role: "assistant", content: "Format flag{...} sedang dianalisis." },
      { role: "user", content: "Coba cek metadata" },
      { role: "assistant", content: "Status: LIKELY, kandidat kuat ditemukan." },
    ],
    toolRuns: [
      { command: "exiftool", purpose: "metadata", status: "ok", summary: "exif ditemukan" },
      { command: "strings -a", purpose: "ekstraksi string", status: "error", summary: "exit 1" },
    ],
    hypotheses: [{ hypothesisId: "H1", description: "LSB menyimpan flag", confidence: 0.4, status: "open" }],
    evidence: [{ title: "Exif", summary: "Terverifikasi: komentar berisi flag" }],
    question: "Apa langkah berikutnya?",
    challengeId: "ch1",
  });

  assert.deepEqual(snapshot.previousQuestions, ["Apa format flagnya?", "Coba cek metadata"]);
  assert.deepEqual(snapshot.previousAnswers, [
    "Format flag{...} sedang dianalisis.",
    "Status: LIKELY, kandidat kuat ditemukan.",
  ]);
  assert.ok(snapshot.attemptedMethods.some((method) => method.includes("exiftool")));
  assert.ok(snapshot.failedApproaches.some((approach) => approach.includes("strings -a")));
  assert.ok(snapshot.confirmedFindings.some((finding) => finding.includes("Exif")));
  assert.ok(snapshot.unresolvedQuestions.some((question) => question.includes("H1")));
  assert.equal(snapshot.challengeState, "kandidat kuat");
  for (const label of [
    "Sudah dijelaskan:",
    "Sudah dicoba:",
    "Gagal:",
    "Dikonfirmasi:",
    "Masih terbuka:",
    "Pertanyaan terbaru:",
  ]) {
    assert.ok(snapshot.summaryText.includes(label), label);
  }
}

function testHypotheses(): void {
  const drafts = buildHypotheses({
    category: "cryptography",
    question: "Flag terenkripsi",
    previousFailures: ["xor sudah dicoba dan gagal"],
  });
  assert.ok(drafts.length >= 3 && drafts.length <= 5);
  assert.ok(drafts.some((draft) => draft.contradictingEvidence.some((item) => item.toLowerCase().includes("xor"))));

  const original = drafts[0];
  const scored = scoreHypotheses({
    hypotheses: drafts,
    evidenceTexts: ["Analisis menemukan XOR dan substitusi Caesar pada data."],
    failures: ["xor sudah dicoba dan gagal"],
  });
  assert.notEqual(scored[0].confidence, original.confidence);
  assert.equal(original.confidence, 0.5);
  assert.equal(original.contradictingEvidence.length, 1);
  assert.ok(scored.length === drafts.length);
}

function testCrossValidation(): void {
  const agreement = crossValidate({
    evidence: [
      { source: "strings", detail: "flag{shared_value}" },
      { source: "metadata", detail: "flag{shared_value}" },
    ],
  });
  assert.ok(agreement.agreements.some((item) => item.value === "flag{shared_value}"));
  assert.equal(agreement.confidence, "HIGH_CONFIDENCE");

  const mismatch = crossValidate({
    evidence: [{ source: "strings", detail: "flag{wrong_value}" }],
    challenge: { expectedFlag: "flag{expected_value}" },
  });
  assert.ok(mismatch.conflicts.some((item) => item.value === "flag{wrong_value}"));
  assert.equal(mismatch.confidence, "INCORRECT");

  const match = crossValidate({
    evidence: [{ source: "strings", detail: "flag{expected_value}" }],
    challenge: { expectedFlag: "flag{expected_value}" },
  });
  assert.equal(match.confidence, "CONFIRMED");
  assert.equal(match.conflicts.length, 0);
}

function testConfidence(): void {
  assert.equal(
    evaluateConfidence({
      expectedFlag: "flag{expected_value}",
      candidates: [{ value: "flag{expected_value}", source: "strings" }],
      agreements: 0,
      conflicts: 0,
      terminalSources: 0,
    }).level,
    "CONFIRMED",
  );
  assert.equal(
    evaluateConfidence({
      candidates: [
        { value: "flag{a}", source: "s1" },
        { value: "flag{b}", source: "s2" },
      ],
      agreements: 2,
      conflicts: 0,
      terminalSources: 1,
    }).level,
    "HIGH_CONFIDENCE",
  );
  assert.equal(
    evaluateConfidence({ candidates: [], agreements: 0, conflicts: 0, terminalSources: 0 }).level,
    "UNVERIFIED",
  );
}

function testQuality(): void {
  const clean = cleanRepetition();

  const short = validateResponse({
    answer: "flag{short_value}",
    question: "Apa flag?",
    intent: "REQUEST_SHORT_ANSWER",
    language: "id",
    repetition: clean,
    shortAllowed: true,
  });
  assert.equal(short.passed, true);
  assert.equal(short.revised, false);

  const missing = validateResponse({
    answer: "Jawaban singkat.",
    question: "Jelaskan langkah analisis dan status verifikasi?",
    intent: "REQUEST_DETAILED_ANSWER",
    language: "id",
    repetition: clean,
    shortAllowed: false,
    expectedSections: true,
  });
  assert.equal(missing.passed, false);
  assert.equal(missing.checks.find((check) => check.name === "followsFormat")?.passed, false);
  assert.equal(missing.revised, true);
  assert.ok(missing.answer.includes("format delapan bagian tidak lengkap"));

  const originalText = "Identifikasi: flag{abc} pada berkas lampiran.";
  const repeated = validateResponse({
    answer: originalText,
    question: "Apa hasil identifikasi?",
    intent: "NEW_QUESTION",
    language: "id",
    repetition: { ...clean, similarity: 0.99, isUnnecessary: true, mustReferencePrevious: false },
    shortAllowed: true,
  });
  assert.equal(repeated.revised, true);
  assert.ok(repeated.answer.startsWith("Konteks sebelumnya masih berlaku;"));
  assert.ok(repeated.answer.endsWith(originalText));

  const essentialRepetition = analyzeRepetition({
    proposed: "flag{abc}",
    previousAnswers: ["flag{abc}"],
    previousCommands: [],
    essential: true,
  });
  const essential = validateResponse({
    answer: "flag{abc}",
    question: "Apa flag?",
    intent: "REQUEST_SHORT_ANSWER",
    language: "id",
    repetition: essentialRepetition,
    shortAllowed: true,
  });
  assert.equal(essential.revised, false);
}

async function testQueue(): Promise<void> {
  const queue = createSerialQueue();
  const firstGate = deferred<string>();
  const secondGate = deferred<string>();
  const sameKeyOrder: string[] = [];

  const first = queue.run("same", async () => {
    sameKeyOrder.push("first-start");
    const value = await firstGate.promise;
    sameKeyOrder.push("first-end");
    return value;
  });
  const second = queue.run("same", async () => {
    sameKeyOrder.push("second-start");
    const value = await secondGate.promise;
    sameKeyOrder.push("second-end");
    return value;
  });

  await flushMicrotasks();
  assert.deepEqual(sameKeyOrder, ["first-start"]);
  firstGate.resolve("satu");
  await flushMicrotasks();
  assert.deepEqual(sameKeyOrder, ["first-start", "first-end", "second-start"]);
  secondGate.resolve("dua");
  assert.deepEqual(await Promise.all([first, second]), ["satu", "dua"]);
  assert.deepEqual(sameKeyOrder, ["first-start", "first-end", "second-start", "second-end"]);

  const otherQueue = createSerialQueue();
  const gateA = deferred<string>();
  const gateB = deferred<string>();
  const interleaved: string[] = [];

  const a = otherQueue.run("a", async () => {
    interleaved.push("a-start");
    const value = await gateA.promise;
    interleaved.push("a-end");
    return value;
  });
  const b = otherQueue.run("b", async () => {
    interleaved.push("b-start");
    const value = await gateB.promise;
    interleaved.push("b-end");
    return value;
  });

  await flushMicrotasks();
  assert.deepEqual(interleaved, ["a-start", "b-start"]);
  gateA.resolve("a");
  gateB.resolve("b");
  assert.deepEqual(await Promise.all([a, b]), ["a", "b"]);

  const errorQueue = createSerialQueue();
  const failing = errorQueue.run("err", async () => {
    throw new Error("gagal");
  });
  const following = errorQueue.run("err", async () => "lanjut");
  await assert.rejects(failing, /gagal/);
  assert.equal(await following, "lanjut");
}

async function main(): Promise<void> {
  testIntents();
  testAntiRepetition();
  testContext();
  testHypotheses();
  testCrossValidation();
  testConfidence();
  testQuality();
  await testQueue();
  console.log("✓ reasoning modules: intent, anti-repetition, context, hypothesis, cross-validation, confidence, quality, queue");
}

void main();
