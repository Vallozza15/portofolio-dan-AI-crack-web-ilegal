import { errorResponse, guard, noStoreJson, readJson } from "@/lib/ctf/api";
import { autonomousOrchestrator } from "@/lib/ctf/autonomous/orchestrator";
import { beginAutonomousRun, combineSignals, endAutonomousRun } from "@/lib/ctf/autonomous/control";
import { getPicoGymNetworkConfig } from "@/lib/ctf/picoctf/network";
import { runResearch } from "@/lib/ctf/research/engine";
import { getResearchConfig } from "@/lib/ctf/research/settings";
import { getResearchSession, listResearchSessions } from "@/lib/ctf/research/store";
import type {
  OfficialValidation,
  ResearchEvent,
  ResearchStatus,
} from "@/lib/ctf/research/types";
import { getSession, newId } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";

interface ResearchRequestBody {
  title?: string;
  platform?: string;
  category?: string;
  url?: string;
  description?: string;
  challengeId?: string;
  sessionId?: string;
  allowFallback?: boolean;
  confirmNetworkAction?: boolean;
  maxSources?: number;
  /** Public writeup URLs already known by the operator, fetched directly from origin. */
  seedUrls?: string[];
  officialValidation?: OfficialValidation;
}

export async function GET(request: Request) {
  const blocked = await guard(request, "research-read", 90);
  if (blocked) return blocked;
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (id) {
      const session = await getResearchSession(id);
      if (!session) return noStoreJson({ error: "Sesi riset tidak ditemukan." }, { status: 404 });
      return noStoreJson({ session });
    }
    const sessions = await listResearchSessions();
    return noStoreJson({ sessions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "research", 12);
  if (blocked) return blocked;
  try {
    const body = await readJson<ResearchRequestBody>(request);
    const title = String(body.title || "").trim();
    const platform = String(body.platform || "").trim();
    if (title.length < 2 || title.length > 200) throw new Error("Judul challenge wajib diisi (2–200 karakter).");
    if (platform.length < 1 || platform.length > 120) throw new Error("Platform wajib diisi (maks 120 karakter).");
    const description = String(body.description || "").slice(0, 20_000);
    const category = String(body.category || "").trim().slice(0, 80);
    const url = String(body.url || "").trim().slice(0, 500);
    const seedUrls = Array.isArray(body.seedUrls)
      ? body.seedUrls.map((item) => String(item || "").trim().slice(0, 500)).filter(Boolean).slice(0, 8)
      : [];
    const official = body.officialValidation;
    if (official) {
      if (!String(official.flag || "").trim() || String(official.evidence || "").trim().length < 8) {
        throw new Error("officialValidation memerlukan flag dan bukti validator resmi (minimal 8 karakter).");
      }
    }

    const config = await getResearchConfig();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ResearchEvent) => {
          if (request.signal.aborted) return;
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const session = await runResearch(
            {
              title,
              platform,
              category,
              url,
              description,
              seedUrls,
              officialValidation: official,
              maxSources: Number.isFinite(body.maxSources) ? Number(body.maxSources) : 16,
            },
            { config, emit: send, signal: request.signal },
          );

          if (
            session.fallbackReason &&
            body.allowFallback !== false &&
            body.sessionId &&
            !request.signal.aborted
          ) {
            const chatSession = await getSession(body.sessionId);
            if (!chatSession) {
              send({
                type: "error",
                message: "Fallback solver tidak dijalankan: sesi chat tidak ditemukan.",
              });
            } else {
              const question = [
                `Selesaikan challenge CTF "${title}" dari platform ${platform}.`,
                description ? `Deskripsi: ${description}` : "",
                "Gunakan tool Kali yang tersedia, baca output nyata, dan laporkan flag hanya jika terverifikasi.",
              ]
                .filter(Boolean)
                .join("\n")
                .slice(0, 20_000);
              const plan = autonomousOrchestrator.interpret({
                question,
                sessionId: chatSession.id,
                challengeId: body.challengeId || chatSession.challengeId,
                language: "id",
              });
              const networkOperations = new Set(["CONNECT_REMOTE", "NETCAT_CONNECT", "GIT_CLONE"]);
              const targetsNetwork =
                networkOperations.has(plan.operation) ||
                Boolean(plan.target?.host && plan.target.port !== undefined);
              if (
                getPicoGymNetworkConfig().requireNetworkConfirmation &&
                targetsNetwork &&
                body.confirmNetworkAction !== true
              ) {
                send({
                  type: "error",
                  message:
                    "Fallback solver menahan aksi jaringan. Centang konfirmasi jaringan hanya untuk instance milik Anda lalu ulangi.",
                });
              } else {
                const resolvedPlan =
                  plan.operation === "GENERAL_QUESTION"
                    ? {
                        ...plan,
                        operation: "AUTO_ANALYZE" as const,
                        confidence: 0.8,
                        reason: "Fallback solver diaktifkan setelah riset publik tidak meyakinkan.",
                        expectedResult: "Analisis Kali nyata dan verifikasi berdasarkan output perintah.",
                        session: { ...plan.session, environment: "local-kali" as const },
                      }
                    : plan;
                send({
                  type: "stage",
                  stage: "fallback-solver",
                  message: "Riset publik tidak cukup; solver otonom lokal dijalankan otomatis.",
                });
                const controllerRun = beginAutonomousRun(chatSession.id);
                const signal = combineSignals(request.signal, controllerRun.signal);
                try {
                  const result = await autonomousOrchestrator.run(resolvedPlan, {
                    sessionId: chatSession.id,
                    challengeId: body.challengeId || chatSession.challengeId,
                    question,
                    requestId: newId("research-fallback"),
                    fileIds: [],
                    language: "id",
                    signal,
                    onEvent: (event) => {
                      send({
                        type: "solver-event",
                        event: event as unknown as Record<string, unknown>,
                      });
                    },
                  });
                  const officialMatches = Boolean(
                    official && result.verifiedFlag && official.flag.trim() === result.verifiedFlag.trim(),
                  );
                  const status: ResearchStatus = officialMatches
                    ? "VERIFIED"
                    : result.verifiedFlag
                      ? "HIGH CONFIDENCE"
                      : "UNVERIFIED";
                  send({
                    type: "solver-answer",
                    answer: result.answer,
                    status,
                    note:
                      status === "VERIFIED"
                        ? "Flag solver cocok dengan bukti validator resmi dari operator."
                        : "Flag berasal dari solver otonom/internal, bukan dari validator resmi CTF.",
                  });
                } catch (error) {
                  send({
                    type: "error",
                    message: error instanceof Error ? error.message.slice(0, 500) : String(error),
                  });
                } finally {
                  endAutonomousRun(chatSession.id, controllerRun);
                }
              }
            }
          }
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message.slice(0, 500) : String(error) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
