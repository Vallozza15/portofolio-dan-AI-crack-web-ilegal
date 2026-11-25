import { guard, errorResponse, readJson } from "@/lib/ctf/api";
import { ensureStructuredAnswer } from "@/lib/ctf/answer";
import { completeText, streamAssistant, type AssistantStreamEvent } from "@/lib/ctf/ai";
import { extractFlagCandidates } from "@/lib/ctf/flag";
import { buildBundleForFiles } from "@/lib/ctf/bundle";
import { persistAssistantReply, type PersistEvidence } from "@/lib/ctf/persist";
import {
  commandTouchesNetwork,
  getPicoGymNetworkConfig,
} from "@/lib/ctf/picoctf/network";
import { RepeatGuard } from "@/lib/ctf/repeat-guard";
import {
  conversationQueue,
} from "@/lib/ctf/reasoning/request-queue";
import {
  nextRequestId,
  ReasoningPipeline,
  rescoreHypothesesFromOutput,
  StrategyPlanner,
  KaliTerminalExecutor,
  type PreparedReasoning,
} from "@/lib/ctf/reasoning/service";
import { REASONING_CONFIG_NOTE, REASONING_LIMITS } from "@/lib/ctf/reasoning/config";
import {
  addMessage,
  getSession,
  getSettings,
  listEvidence,
  listFiles,
  listHypotheses,
  listMessages,
  listReasoningContexts,
  listToolRuns,
} from "@/lib/ctf/store";
import {
  buildAnalysisPlan,
  buildEnvironmentCommand,
  KALI_TOOLS,
  startTerminal,
  validateTerminalCommand,
  type TerminalInfo,
} from "@/lib/ctf/terminal";
import type { LocalAnalysisBundle, ProviderId } from "@/lib/ctf/types";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

// Bounded by default so a stalled challenge cannot loop indefinitely. Both
// limits remain configurable for authorized longer runs.
const MAX_ATTEMPTS = Math.max(
  1,
  Math.min(1_000, Number(process.env.CTF_AGENT_MAX_ATTEMPTS || 100)),
);
const TIME_BUDGET_MS = Math.max(
  30_000,
  Math.min(3_600_000, Number(process.env.CTF_AGENT_TIME_BUDGET_MS || 600_000)),
);
const MAX_REFINEMENTS = Math.max(
  1,
  Math.min(200, Number(process.env.CTF_AGENT_MAX_REFINEMENTS || 25)),
);
const reasoning = new ReasoningPipeline();
const strategyPlanner = new StrategyPlanner();
const terminalExecutor = new KaliTerminalExecutor();

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const parts = [hours ? `${hours}j` : "", minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean);
  return parts.join(" ");
}

const PLANNER_SYSTEM = `Kamu adalah perencana perintah untuk container Kali Linux yang terisolasi.
Tugasmu: memilih perintah analisis yang benar-benar berguna untuk challenge CTF yang diberikan.

ATURAN:
1. Kembalikan HANYA JSON valid: {"commands":["perintah 1","perintah 2"],"reason":"alasan singkat"}.
2. Maksimal 6 perintah. Satu perintah per string. Jangan menaruh penjelasan di luar JSON.
3. Gunakan path yang diberikan (contoh: /analysis/00_file.png). Jangan mengarang nama file.
4. Sebelum memakai tool, periksa daftar "TOOL TERSEDIA" pada prompt. Jika tidak ada, pakai alternatif yang tersedia atau laporkan kebutuhan instalasinya di reason. Jangan mengandaikan tool terpasang.
5. Jangan menjalankan binary yang diunggah. Gunakan analisis statis (file, strings, binwalk, readelf, objdump, exiftool, dll).
6. Jangan mengakses jaringan, jangan memakai sudo/mount/docker, dan jangan mengubah /analysis. Tulis hanya ke /work atau /tmp.
7. Jangan mengarang output. Setiap perintah akan dijalankan nyata dan output aslinya dikirim balik kepadamu.
8. Hindari mengulang perintah yang sudah gagal atau sudah menghasilkan informasi yang sama.`;

const REFINE_SYSTEM = `${PLANNER_SYSTEM}

Kamu sedang dalam putaran lanjutan. Output dari putaran pertama sudah diberikan.
Pilih maksimal 4 perintah baru yang menyelidiki hal yang masih belum jelas, atau kembalikan {"commands":[],"reason":"bukti cukup"} jika tidak ada yang perlu dijalankan.`;

interface ParsedPlan {
  commands: string[];
  reason: string;
}

function parsePlan(text: string, limit = 6): ParsedPlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { commands: [], reason: "" };
  try {
    const parsed = JSON.parse(match[0]) as { commands?: unknown; reason?: unknown };
    if (!Array.isArray(parsed.commands)) return { commands: [], reason: "" };
    return {
      commands: parsed.commands
        .map((command) => String(command).trim())
        .filter((command) => command && validateTerminalCommand(command).ok)
        .slice(0, limit),
      reason: String(parsed.reason || "").slice(0, 500),
    };
  } catch {
    return { commands: [], reason: "" };
  }
}

function plannerPrompt(input: {
  bundle?: LocalAnalysisBundle;
  info: TerminalInfo;
  question: string;
  language: "id" | "en";
  reasoning?: PreparedReasoning;
}): string {
  const challenge = input.bundle?.challenge;
  const fileLines = input.info.files.length
    ? input.info.files
        .map((file) => `- ${file.target} (${file.name}, ${file.size} bytes)`)
        .join("\n")
    : "- Tidak ada file yang dilampirkan. Fokus pada analisis teks/ciphertext dari pertanyaan.";
  const available = new Set(input.info.tools);
  const toolLines = [
    `TOOL TERSEDIA: ${input.info.tools.join(", ") || "belum terdeteksi"}`,
    `TOOL TIDAK TERSEDIA: ${KALI_TOOLS.filter((tool) => !available.has(tool)).join(", ") || "tidak ada"}`,
    `Working directory saat ini: ${input.info.cwd}`,
  ];
  return [
    `Challenge: ${challenge?.title || "ad-hoc"}`,
    `Kategori: ${challenge?.category || input.bundle?.category || "unknown"}`,
    `Format flag: ${challenge?.flagFormat || "flag{...}"}`,
    `Deskripsi: ${(challenge?.description || "—").slice(0, 2000)}`,
    "",
    "File di dalam container:",
    fileLines,
    "",
    ...toolLines,
    "",
    ...(input.reasoning
      ? [
          `Niat pengguna: ${input.reasoning.intent}. ${input.reasoning.intentReason}`,
          `Konteks investigasi:\n${input.reasoning.context.summaryText.slice(0, 2400)}`,
          `Hipotesis aktif:\n${input.reasoning.hypotheses.slice(0, 5).map((item) => `- ${item.id} (${item.status}): ${item.description}`).join("\n") || "-"}`,
          `Metode yang sudah dicoba: ${input.reasoning.context.attemptedMethods.slice(0, 12).join(" | ") || "-"}`,
          `Metode yang gagal: ${input.reasoning.context.failedApproaches.slice(0, 12).join(" | ") || "-"}`,
          "",
        ]
      : []),
    `Pertanyaan / perintah pengguna: ${input.question}`,
    "",
    input.language === "en"
      ? "Return only the JSON plan now."
      : "Kembalikan hanya JSON rencana perintah sekarang.",
  ].join("\n");
}

function refinePrompt(input: {
  question: string;
  outputs: Array<{ command: string; output: string; exitCode: number | null }>;
  language: "id" | "en";
  reasoning?: PreparedReasoning;
}): string {
  return [
    `Pertanyaan asli: ${input.question}`,
    "",
    ...(input.reasoning
      ? [
          `Niat: ${input.reasoning.intent}. Hindari pengulangan: ${input.reasoning.repetition.note}`,
          `Masih terbuka: ${input.reasoning.context.unresolvedQuestions.slice(0, 8).join(" | ") || "-"}`,
          "",
        ]
      : []),
    "Output putaran pertama (asli dari container):",
    ...input.outputs.map(
      (item, index) =>
        `[${index + 1}] $ ${item.command}\n(exit ${item.exitCode})\n${item.output.slice(0, 900)}`,
    ),
    "",
    input.language === "en"
      ? "Return only the JSON plan for the next investigation step."
      : "Kembalikan hanya JSON rencana untuk langkah penyelidikan berikutnya.",
  ].join("\n");
}

export async function POST(request: Request) {
  const blocked = await guard(request, "agent", 8);
  if (blocked) return blocked;
  try {
    const body = await readJson<{
      sessionId?: string;
      message?: string;
      fileIds?: string[];
      mode?: "learning" | "expert" | "hint";
      language?: "id" | "en";
      provider?: ProviderId;
      confirmNetworkAction?: boolean;
    }>(request);
    if (!body.sessionId) throw new Error("sessionId wajib diisi.");
    const content = String(body.message || "").trim();
    if (!content) throw new Error("Pesan tidak boleh kosong.");
    if (content.length > 20_000) throw new Error("Pesan terlalu panjang (maks 20.000 karakter).");
    const session = await getSession(body.sessionId);
    if (!session) throw new Error("Sesi tidak ditemukan.");
    const mode =
      body.mode && ["learning", "expert", "hint"].includes(body.mode) ? body.mode : session.mode;
    const language =
      body.language === "en" ? "en" : body.language === "id" ? "id" : session.language;
    const provider = body.provider || session.provider;
    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.map((id) => String(id)).slice(0, 20)
      : [];

    const requestId = nextRequestId();
    const conversationId = session.id;
    await addMessage({
      sessionId: session.id,
      role: "user",
      content,
      mode,
      evidenceIds: fileIds,
      requestId,
      conversationId,
    });

    const { bundle } = await buildBundleForFiles({
      challengeId: session.challengeId,
      fileIds,
      title: session.title,
      description: content,
      message: content,
    });
    const settings = await getSettings();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        await conversationQueue.run(conversationId, async () => {
        const startedAt = Date.now();
        let attempts = 0;
        let cycles = 0;
        let full = "";
        let usedProvider: ProviderId = provider;
        let usedModel = session.model;
        const terminalEvidence: PersistEvidence[] = [];
        const warnedNetworkCommands = new Set<string>();
        const streamed: AssistantStreamEvent[] = [];
        let history: Array<{ role: "user" | "assistant"; content: string; createdAt?: string }> = [];
        let prepared: PreparedReasoning | null = null;
        let shortAllowed = false;
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          let terminalInfo: TerminalInfo | null = null;
          try {
            terminalInfo = await startTerminal(session.id, fileIds);
            send({
              type: "terminal",
              state: "ready",
              container: terminalInfo.containerName,
              network: terminalInfo.network,
              files: terminalInfo.files,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            send({
              type: "note",
              message: `Terminal Kali tidak tersedia: ${message}. Analisis dilanjutkan tanpa eksekusi.`,
            });
          }

          const [storedMessages, toolRuns, evidence, hypotheses, contextRows] = await Promise.all([
            listMessages(session.id),
            listToolRuns(session.id),
            listEvidence({ sessionId: session.id }),
            listHypotheses(session.id),
            listReasoningContexts(session.id),
          ]);
          history = storedMessages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              role: message.role as "user" | "assistant",
              content: message.content,
              createdAt: message.createdAt,
            }));
          const previousChallengeId = [...contextRows]
            .reverse()
            .find((item) => item.challengeId && item.challengeId !== session.challengeId)?.challengeId;
          prepared = reasoning.prepare({
            sessionId: session.id,
            requestId,
            question: content,
            messages: history,
            toolRuns,
            hypotheses,
            evidence: evidence.map((item) => ({
              title: item.title,
              summary: item.summary,
              detail: item.detail,
            })),
            bundle,
            terminalEvidence: [],
            language,
            previousChallengeId,
          });
          shortAllowed = prepared.intent === "REQUEST_SHORT_ANSWER";
          send({
            type: "meta",
            requestId,
            conversationId,
            intent: prepared.intent,
            confidence: prepared.confidence.level,
          });
          send(reasoning.event(prepared, session.id));
          send({
            type: "note",
            message: `Batas penalaran aktif: ${REASONING_CONFIG_NOTE}.`,
          });

          if (terminalInfo) {
            const info = terminalInfo;
            const firstOutputs: Array<{
              command: string;
              output: string;
              exitCode: number | null;
            }> = [];
            const execute = async (command: string, phase: string) => {
              if (request.signal.aborted) return null;
              if (
                getPicoGymNetworkConfig().requireNetworkConfirmation &&
                body.confirmNetworkAction !== true &&
                commandTouchesNetwork(command)
              ) {
                if (!warnedNetworkCommands.has(command)) {
                  warnedNetworkCommands.add(command);
                  send({
                    type: "error",
                    message:
                      "Perintah jaringan ditunda: kirim ulang dengan confirmNetworkAction=true untuk instance picoGym milik Anda.",
                    phase,
                    requestId,
                  });
                }
                return null;
              }
              const hypothesisId = prepared?.hypotheses.find(
                (item) => item.status === "testing" || item.status === "supported",
              )?.id;
              send({ type: "command", command, phase, requestId });
              const result = await terminalExecutor.execute({
                sessionId: session.id,
                command,
                fileIds,
                timeoutMs: 15_000,
                requestId,
                purpose: phase,
                hypothesisId,
                phase,
                challengeId: session.challengeId,
              });
              send({
                type: "output",
                phase,
                commandId: result.commandId,
                sessionId: result.sessionId,
                command,
                cwd: result.cwd,
                stdout: result.stdout,
                stderr: result.stderr,
                output: result.output,
                execStatus: result.status,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
                artifacts: result.artifacts,
                processes: result.processes,
                requestId,
                purpose: result.purpose,
                hypothesisId: result.hypothesisId,
              });
              terminalEvidence.push({
                title: `Kali: ${command.slice(0, 160)}`,
                summary:
                  result.stdout
                    .split("\n")
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(" | ")
                    .slice(0, 400) || result.stderr.slice(0, 400) || "Tidak ada output.",
                detail: result.output.slice(0, 6000),
                confidence: result.status === "ok" ? "high" : "medium",
              });
              void rescoreHypothesesFromOutput({
                sessionId: session.id,
                requestId,
                outputText: result.output.slice(0, 12_000),
                failures: result.status === "ok" ? [] : [command],
                flagFormat,
                expectedFlag: bundle?.challenge.expectedFlag,
              }).catch(() => undefined);
              return result;
            };

            const flagFormat = bundle?.challenge.flagFormat;
            const candidatesIn = (text: string) =>
              extractFlagCandidates(text, flagFormat).map((candidate) => candidate.value);

            // A candidate is only accepted as final when it is either the exact
            // expected flag, or independently observed in at least two distinct
            // real operations. Placeholder values such as flag{...} are already
            // removed by extractFlagCandidates.
            const confirmedValue = (): string | null => {
              const expected = bundle?.challenge.expectedFlag?.trim();
              const seen = new Map<string, Set<string>>();
              const record = (value: string, source: string) => {
                if (!seen.has(value)) seen.set(value, new Set());
                seen.get(value)!.add(source);
              };
              for (const candidate of bundle?.flagCandidates || []) {
                record(candidate.value, `upload: ${candidate.source}`);
              }
              terminalEvidence.forEach((item, index) => {
                for (const value of new Set(candidatesIn(item.detail))) {
                  record(value, `kali-${index}: ${item.title.slice(0, 60)}`);
                }
              });
              // Local upload analysis alone is not enough: the answer must also
              // be reproduced by a real command inside the Kali sandbox.
              const terminalValues = new Set(
                terminalEvidence.flatMap((item) => candidatesIn(item.detail)),
              );
              if (expected) return terminalValues.has(expected) ? expected : null;
              const ranked = [...seen.entries()].sort((a, b) => b[1].size - a[1].size);
              return (
                ranked.find(
                  ([value, sources]) =>
                    sources.size >= 2 && terminalValues.has(value),
                )?.[0] || null
              );
            };

            // Exact-repetition guard. Default 0 means skip duplicates; a higher
            // configured value keeps the legacy "restart from first command" mode.
            const MAX_REPEATS = REASONING_LIMITS.maxRepeatedCommands;
            const deadline = startedAt + TIME_BUDGET_MS;
            const guard = new RepeatGuard(MAX_REPEATS);
            const usedCommands = new Set<string>();

            const executeTracked = async (command: string, phase: string) => {
              if (attempts >= MAX_ATTEMPTS) return "exhausted" as const;
              if (guard.check(command) === "restart") {
                if (MAX_REPEATS === 0 && usedCommands.has(command.trim().toLowerCase())) {
                  send({
                    type: "note",
                    message: `Per-identik dilewati: "${command.slice(0, 90)}" sudah dijalankan. Strategi lain dipakai.`,
                  });
                  return "skip" as const;
                }
                usedCommands.add(command.trim().toLowerCase());
                send({
                  type: "note",
                  message: `Perintah "${command.slice(0, 90)}" mencapai ${MAX_REPEATS}x eksekusi. Kembali ke eksekusi pertama (siklus ${guard.cycles}).`,
                });
                return "restart" as const;
              }
              usedCommands.add(command.trim().toLowerCase());
              attempts += 1;
              const result = await execute(command, phase);
              if (result) {
                firstOutputs.push({
                  command,
                  output: result.stdout || result.stderr,
                  exitCode: result.exitCode,
                });
              }
              return result;
            };

            const runCycle = async (commands: string[], phase: string) => {
              for (let index = 0; index < commands.length; index += 1) {
                if (
                  confirmedValue() ||
                  request.signal.aborted ||
                  Date.now() >= deadline ||
                  attempts >= MAX_ATTEMPTS
                ) {
                  return false;
                }
                const outcome = await executeTracked(commands[index], phase);
                if (outcome === "restart") index = -1;
              }
              return true;
            };

            // PHASE 1 — environment check before any challenge command.
            const environment = await execute(buildEnvironmentCommand(), "init");
            if (environment) {
              firstOutputs.push({
                command: "environment check",
                output: environment.stdout.slice(0, 1200),
                exitCode: environment.exitCode,
              });
            }

            let commands: string[] = [];
            let planReason = "";
            let planSource = "deterministik";
            if (provider !== "local") {
              send({
                type: "note",
                message: "Menyusun rencana perintah dengan AI; fallback deterministik jika gagal.",
              });
              const completion = await completeText({
                system: PLANNER_SYSTEM,
                messages: [
                  {
                    role: "user",
                    content: plannerPrompt({
                      bundle,
                      info,
                      question: content,
                      language,
                      reasoning: prepared || undefined,
                    }),
                  },
                ],
                provider,
                signal: request.signal,
                maxChars: 5000,
              });
              if (completion) {
                const parsed = parsePlan(completion.text);
                if (parsed.commands.length) {
                  commands = parsed.commands;
                  planReason = parsed.reason;
                  planSource = `AI ${completion.provider}/${completion.model}`;
                }
              }
            }
            if (!commands.length) {
              const allFiles = await listFiles();
              const records = allFiles.filter((file) =>
                info.files.some((entry) => entry.id === file.id),
              );
              commands = buildAnalysisPlan(info.files, records);
              planReason =
                "Model tidak menghasilkan JSON yang dapat dipakai; rencana deterministik berdasarkan tipe file.";
            } else {
              const baseline = [
                "pwd; id; uname -a",
                "ls -la /analysis; echo '--- MANIFEST ---'; cat /analysis/MANIFEST.txt",
              ];
              commands = [
                ...baseline,
                ...commands.filter((command) => !baseline.includes(command)),
              ];
            }
            const initialPlan = strategyPlanner.cap(commands, planReason);
            commands = initialPlan.commands;
            planReason = initialPlan.reason;

            send({
              type: "note",
              message: `Solver berjalan sampai jawaban terverifikasi: maksimal ${MAX_ATTEMPTS.toLocaleString("id-ID")} percobaan atau ${formatDuration(TIME_BUDGET_MS)}. Perintah identik: ${MAX_REPEATS === 0 ? "duplikat dilewati" : `maksimal ${MAX_REPEATS}x lalu diulang dari awal`}. Batas penalaran: ${REASONING_CONFIG_NOTE}.`,
            });
            send({ type: "plan", source: planSource, reason: planReason, commands });

            let activeCommands = commands;
            let refinements = 0;
            let reasoningIterations = 0;
            let verificationAttempts = 0;
            let verificationLimitNoted = false;
            while (
              !confirmedValue() &&
              !request.signal.aborted &&
              Date.now() < deadline &&
              attempts < MAX_ATTEMPTS
            ) {
              const completed = await runCycle(activeCommands, "analysis");
              if (
                confirmedValue() ||
                !completed ||
                Date.now() >= deadline ||
                attempts >= MAX_ATTEMPTS
              ) {
                break;
              }

              let nextCommands: string[] = [];
              let nextSource = "deterministik (putaran lanjutan)";
              let nextReason = "Strategi baru dari putaran sebelumnya.";

              if (
                provider !== "local" &&
                refinements < MAX_REFINEMENTS &&
                reasoningIterations < REASONING_LIMITS.maxIterations &&
                verificationAttempts < REASONING_LIMITS.maxVerificationAttempts
              ) {
                refinements += 1;
                reasoningIterations += 1;
                verificationAttempts += 1;
                send({
                  type: "note",
                  message: "Jawaban belum terverifikasi. AI menyusun strategi baru dari output nyata.",
                });
                const refinement = await completeText({
                  system: REFINE_SYSTEM,
                  messages: [
                    {
                      role: "user",
                      content: refinePrompt({
                        question: content,
                        outputs: firstOutputs.slice(-8),
                        language,
                        reasoning: prepared || undefined,
                      }),
                    },
                  ],
                  provider,
                  signal: request.signal,
                  maxChars: 3000,
                });
                if (refinement) {
                  const parsed = parsePlan(refinement.text, 4);
                  if (parsed.commands.length) {
                    nextCommands = parsed.commands;
                    nextSource = `AI ${refinement.provider}/${refinement.model} (lanjutan)`;
                    nextReason = parsed.reason;
                  }
                }
              }

              if (
                verificationAttempts >= REASONING_LIMITS.maxVerificationAttempts &&
                !verificationLimitNoted
              ) {
                verificationLimitNoted = true;
                send({
                  type: "note",
                  message: `Batas verifikasi eksplisit tercapai (${REASONING_LIMITS.maxVerificationAttempts}x). Strategi deterministik yang dipakai; status akhir tetap mengikuti bukti nyata.`,
                });
              }
              if (!nextCommands.length) {
                nextCommands = strategyPlanner.fallback(
                  guard.cycles,
                  info.files,
                  info.tools,
                  [...usedCommands],
                );
                nextReason = `Strategi deterministik siklus ${guard.cycles + 1} berdasarkan tool yang tersedia dan perintah yang belum dipakai.`;
              }
              if (reasoningIterations >= REASONING_LIMITS.maxIterations) {
                nextReason = `${nextReason} Batas iterasi penalaran tercapai; strategi deterministik dipakai.`;
              }
              const cappedNext = strategyPlanner.cap(nextCommands, nextReason);
              nextCommands = cappedNext.commands;
              nextReason = cappedNext.reason;
              send({ type: "plan", source: nextSource, reason: nextReason, commands: nextCommands });
              activeCommands = nextCommands;
            }

            const finalCandidate = confirmedValue();
            send({
              type: "note",
              message: finalCandidate
                ? `Jawaban dianggap pasti: ${finalCandidate} (cocok dengan expected flag atau dikonfirmasi dari beberapa operasi nyata).`
                : request.signal.aborted
                  ? "Eksekusi dibatalkan pengguna."
                  : Date.now() >= deadline || attempts >= MAX_ATTEMPTS
                    ? `Batas solver tercapai (${attempts} percobaan, ${formatDuration(Date.now() - startedAt)}). Laporan akhir menyatakan hasil apa adanya.`
                    : "Tidak ada kandidat yang dapat diverifikasi dari eksekusi nyata. Laporan akhir menyatakan hasil apa adanya.",
            });
            cycles = guard.cycles;
          }

          prepared = reasoning.prepare({
            sessionId: session.id,
            requestId,
            question: content,
            messages: history,
            toolRuns: await listToolRuns(session.id),
            hypotheses: await listHypotheses(session.id),
            evidence: (await listEvidence({ sessionId: session.id })).map((item) => ({
              title: item.title,
              summary: item.summary,
              detail: item.detail,
            })),
            bundle,
            terminalEvidence: terminalEvidence.map((item) => ({
              source: item.title,
              detail: item.detail,
            })),
            language,
          });
          shortAllowed = prepared.intent === "REQUEST_SHORT_ANSWER";
          send(reasoning.event(prepared, session.id));

          for await (const event of streamAssistant({
            messages: history,
            bundle,
            settings,
            mode,
            language,
            provider,
            signal: request.signal,
            extraEvidence: [...prepared.extraEvidence, ...terminalEvidence],
            extraInstructions: prepared.extraInstructions,
          })) {
            streamed.push(event);
            if (event.type === "meta") {
              if (event.provider) usedProvider = event.provider;
              if (event.model) usedModel = event.model;
            }
            if (event.type === "delta" && event.text) full += event.text;
          }

          // Jawaban pasti: model kecil sering mengabaikan format 8 bagian.
          // Jika struktur tidak lengkap, susun ulang dari bukti nyata.
          const structured = ensureStructuredAnswer({
            streamed,
            full,
            messages: history,
            bundle,
            mode,
            language,
            extraEvidence: terminalEvidence,
            provider: usedProvider,
            model: usedModel,
            allowShort: shortAllowed,
          });
          if (structured.rebuilt) {
            send({
              type: "note",
              message:
                "Model tidak menghasilkan struktur 8 bagian yang lengkap; laporan akhir disusun ulang dari bukti nyata oleh mesin deterministik.",
            });
            full = structured.full;
            usedProvider = structured.provider;
            usedModel = structured.model;
          }
          for (const event of structured.streamed) {
            if (event.type === "note" || event.type === "error") send(event);
          }

          if (full.trim() && prepared) {
            const finalized = await reasoning.finalize({
              prepared,
              answer: full,
              question: content,
              language,
              shortAllowed,
              expectedSections: !shortAllowed,
            });
            full = finalized.answer;
            if (finalized.revised) {
              send({
                type: "note",
                message:
                  "Kontrol mutu menyesuaikan jawaban agar tidak mengulang konteks lama atau menyesatkan status bukti.",
              });
            }
          }

          if (full.trim()) {
            const elapsedMs = Date.now() - startedAt;
            send({
              type: "note",
              message: `Waktu pengerjaan solver: ${formatDuration(elapsedMs)} (${elapsedMs} ms), ${attempts} percobaan, ${cycles} siklus pengulangan.`,
            });
            full += [
              "",
              "---",
              "",
              "**Waktu pengerjaan solver:** " +
                `${formatDuration(elapsedMs)} (${elapsedMs} ms)`,
              `**Percobaan eksekusi:** ${attempts.toLocaleString("id-ID")} perintah`,
              `**Siklus pengulangan:** ${cycles}`,
              `**Batas solver:** ${MAX_ATTEMPTS.toLocaleString("id-ID")} percobaan atau ${formatDuration(TIME_BUDGET_MS)}`,
            ].join("\n");
            send({ type: "meta", provider: usedProvider, model: usedModel });
            for (let index = 0; index < full.length; index += 220) {
              send({ type: "delta", text: full.slice(index, index + 220) });
            }
            send({ type: "done" });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send({ type: "error", message });
        }

        if (full.trim()) {
          try {
            const persisted = await persistAssistantReply({
              session,
              bundle,
              full,
              provider: usedProvider,
              model: usedModel,
              mode,
              fileIds,
              userContent: content,
              extraEvidence: terminalEvidence,
              scope: "agent.message",
            });
            if (prepared) await reasoning.persist(prepared, persisted.messageId);
            send({
              type: "saved",
              status: persisted.status,
              requestId,
              conversationId,
              intent: prepared?.intent,
              confidence: prepared?.confidence.level,
              confidenceScore: prepared?.confidence.score,
              provider: usedProvider,
              model: usedModel,
              messageId: persisted.messageId,
              evidenceIds: persisted.evidenceIds,
              terminalCommands: terminalEvidence.length,
              elapsedMs: Date.now() - startedAt,
              attempts,
              cycles,
              maxAttempts: MAX_ATTEMPTS,
            });
          } catch (error) {
            send({
              type: "error",
              message: `Jawaban diterima tetapi gagal disimpan: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        } else if (!full.trim()) {
          send({ type: "error", message: "Tidak ada jawaban yang dihasilkan." });
        }
        try {
          controller.close();
        } catch {
          // Client disconnected.
        }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
