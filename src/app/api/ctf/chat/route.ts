import { ensureStructuredAnswer } from "@/lib/ctf/answer";
import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { streamAssistant, type AssistantStreamEvent } from "@/lib/ctf/ai";
import { beginAutonomousRun, combineSignals, endAutonomousRun } from "@/lib/ctf/autonomous/control";
import { autonomousOrchestrator } from "@/lib/ctf/autonomous/orchestrator";
import { buildBundleForFiles } from "@/lib/ctf/bundle";
import { persistAssistantReply } from "@/lib/ctf/persist";
import { getPicoGymNetworkConfig } from "@/lib/ctf/picoctf/network";
import { conversationQueue } from "@/lib/ctf/reasoning/request-queue";
import {
  nextRequestId,
  ReasoningPipeline,
  type PreparedReasoning,
} from "@/lib/ctf/reasoning/service";
import {
  addMessage,
  getSession,
  getSettings,
  listEvidence,
  listHypotheses,
  listMessages,
  listReasoningContexts,
  listToolRuns,
} from "@/lib/ctf/store";
import type { ProviderId } from "@/lib/ctf/types";

const reasoning = new ReasoningPipeline();

const AUTO_ANALYSIS_HINT =
  /\b(analisis|analyze|analyse|periksa|inspect|check|cek|jalankan|run|tool|tools|kali|terminal|flag|solve|selesaikan|kerjakan|decode|dekode|file\s+ini|lampiran|challenge\s+ini|soal\s+ini|baca|buka|ekstrak|extract)\b/i;

export async function POST(request: Request) {
  const blocked = await guard(request, "chat", 20);
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
    const mode = body.mode && ["learning", "expert", "hint"].includes(body.mode) ? body.mode : session.mode;
    const language = body.language === "en" ? "en" : body.language === "id" ? "id" : session.language;
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

    // A single interpreter decides whether this message is an actionable
    // remote command or an ordinary question. General questions and explicit
    // report requests keep the existing AI path untouched.
    const initialPlan = autonomousOrchestrator.interpret({
      question: content,
      sessionId: session.id,
      challengeId: session.challengeId,
      language,
    });
    let plan = initialPlan;
    if (
      plan.operation === "GENERAL_QUESTION" &&
      (fileIds.length > 0 || Boolean(session.challengeId)) &&
      AUTO_ANALYSIS_HINT.test(content)
    ) {
      plan = {
        ...plan,
        operation: "AUTO_ANALYZE",
        confidence: 0.85,
        reason:
          language === "id"
            ? "Permintaan analisis pada konteks challenge/berkas diteruskan ke tool Kali otomatis."
            : "An analysis request on challenge/file context was routed to automatic Kali tools.",
        expectedResult:
          language === "id"
            ? "Tool Kali dijalankan otomatis dan jawaban ringkas diberikan dari output nyata."
            : "Kali tools run automatically and a concise answer is produced from real output.",
        session: { ...plan.session, environment: "local-kali" },
      };
    }
    const actionable = plan.operation !== "GENERAL_QUESTION" && plan.operation !== "REQUEST_REPORT";

    // picoGym mode requires a separate, explicit operator confirmation before
    // any action that can touch a remote challenge instance.
    const networkOperations = new Set(["CONNECT_REMOTE", "NETCAT_CONNECT", "GIT_CLONE"]);
    const targetsNetwork =
      networkOperations.has(plan.operation) ||
      Boolean(plan.target?.host && plan.target.port !== undefined);
    if (
      getPicoGymNetworkConfig().requireNetworkConfirmation &&
      targetsNetwork &&
      body.confirmNetworkAction !== true
    ) {
      return noStoreJson(
        {
          error:
            "Aksi jaringan memerlukan konfirmasi eksplisit. Kirim ulang dengan confirmNetworkAction=true hanya untuk instance challenge milik Anda.",
          operation: plan.operation,
          requiresConfirmation: true,
        },
        { status: 428 },
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        await conversationQueue.run(conversationId, async () => {
          let full = "";
          let usedProvider: ProviderId = provider;
          let usedModel = session.model;
          let streamError = "";
          let history: Array<{
            role: "user" | "assistant";
            content: string;
            createdAt?: string;
          }> = [];
          let prepared: PreparedReasoning | null = null;
          let shortAllowed = false;
          const streamed: AssistantStreamEvent[] = [];
          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          try {
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

            if (actionable) {
              // Autonomous path: no reasoning events, no 8-section report.
              // Only concise operational notes and the final answer reach UI.
              const runController = beginAutonomousRun(session.id);
              const signal = combineSignals(request.signal, runController.signal);
              try {
                const result = await autonomousOrchestrator.run(plan, {
                  sessionId: session.id,
                  challengeId: session.challengeId,
                  question: content,
                  requestId,
                  fileIds,
                  language,
                  signal,
                  onEvent: (event) => {
                    if (event.type === "note") send({ type: "note", message: event.message });
                    else if (event.type === "delta") send({ type: "delta", text: event.text });
                    else if (event.type === "status") send({ type: "status", status: event.status, stage: event.stage });
                    else if (event.type === "execution-plan") {
                      send({
                        type: "execution-plan",
                        category: event.category,
                        strategy: event.strategy,
                        environment: event.environment,
                        operation: event.operation,
                      });
                    } else if (event.type === "step") {
                      send({ type: "step", step: event.step });
                    } else if (event.type === "command") {
                      send({
                        type: "command",
                        commandId: event.commandId,
                        stepId: event.stepId,
                        command: event.command,
                        phase: event.phase,
                      });
                    } else if (event.type === "output") {
                      send({
                        type: "output",
                        commandId: event.commandId,
                        stepId: event.stepId,
                        command: event.command,
                        phase: event.phase,
                        cwd: event.cwd,
                        stdout: event.stdout,
                        stderr: event.stderr,
                        output: event.output,
                        execStatus: event.status,
                        exitCode: event.exitCode,
                        durationMs: event.durationMs,
                        artifacts: event.artifacts,
                      });
                    } else if (event.type === "verification") {
                      send({
                        type: "verification",
                        verification: event.verification,
                        flag: event.flag,
                      });
                    } else if (event.type === "flag") {
                      send({ type: "flag", flag: event.flag, source: event.source });
                    } else if (event.type === "error") send({ type: "error", message: event.message });
                    else if (event.type === "done") send({ type: "done" });
                  },
                });
                full = result.answer;
                usedProvider = "local";
                usedModel = "autonomous";
                for (let index = 0; index < full.length; index += 220) {
                  send({ type: "delta", text: full.slice(index, index + 220) });
                }
              } catch (error) {
                streamError = error instanceof Error ? error.message : String(error);
                send({ type: "error", message: streamError });
              } finally {
                endAutonomousRun(session.id, runController);
              }
            } else {
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
              // Internal reasoning is persisted but no longer pushed to the UI.
              void reasoning.event(prepared, session.id);

              for await (const event of streamAssistant({
                messages: history,
                bundle,
                settings,
                mode,
                language,
                provider,
                signal: request.signal,
                extraEvidence: prepared.extraEvidence,
                extraInstructions: prepared.extraInstructions,
              })) {
                streamed.push(event);
                if (event.type === "meta") {
                  if (event.provider) usedProvider = event.provider;
                  if (event.model) usedModel = event.model;
                }
                if (event.type === "delta" && event.text) full += event.text;
              }
            }
          } catch (error) {
            streamError = error instanceof Error ? error.message : String(error);
            send({ type: "error", message: streamError });
          }

          if (!actionable && streamed.length && !streamError) {
            const structured = ensureStructuredAnswer({
              streamed,
              full,
              messages: history,
              bundle,
              mode,
              language,
              provider: usedProvider,
              model: usedModel,
              allowShort: shortAllowed,
            });
            if (structured.rebuilt) {
              full = structured.full;
              usedProvider = structured.provider;
              usedModel = structured.model;
            }
            for (const event of structured.streamed) {
              if (event.type !== "delta") send(event);
            }
          }

          if (!actionable && full.trim() && !streamError && prepared) {
            const finalized = await reasoning.finalize({
              prepared,
              answer: full,
              question: content,
              language,
              shortAllowed,
              expectedSections: !shortAllowed,
            });
            full = finalized.answer;
            for (let index = 0; index < full.length; index += 220) {
              send({ type: "delta", text: full.slice(index, index + 220) });
            }
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
                scope: actionable ? "chat.autonomous" : "chat.message",
              });
              if (prepared) await reasoning.persist(prepared, persisted.messageId);
              send({
                type: "saved",
                status: persisted.status,
                provider: usedProvider,
                model: usedModel,
                messageId: persisted.messageId,
                evidenceIds: persisted.evidenceIds,
                requestId,
                conversationId,
                intent: actionable ? plan.operation : prepared?.intent,
                confidence: prepared?.confidence.level,
                confidenceScore: prepared?.confidence.score,
              });
            } catch (error) {
              send({
                type: "error",
                message: `Jawaban diterima tetapi gagal disimpan: ${error instanceof Error ? error.message : String(error)}`,
              });
            }
          } else if (streamError) {
            send({ type: "error", message: streamError });
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
