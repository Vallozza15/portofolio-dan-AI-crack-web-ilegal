import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import {
  createSession,
  getChallenge,
  listChallenges,
  listMessages,
  listSessions,
} from "@/lib/ctf/store";
import type { ProviderId, SessionMode } from "@/lib/ctf/types";

const MODES: SessionMode[] = ["learning", "expert", "hint"];
const PROVIDERS: ProviderId[] = ["openai", "anthropic", "gemini", "ollama", "compatible", "local"];

export async function GET(request: Request) {
  const blocked = await guard(request, "sessions-list", 120);
  if (blocked) return blocked;
  try {
    const [sessions, challenges] = await Promise.all([listSessions(), listChallenges()]);
    const enriched = await Promise.all(
      sessions.slice(0, 100).map(async (session) => ({
        ...session,
        challengeTitle: challenges.find((challenge) => challenge.id === session.challengeId)?.title,
        messageCount: (await listMessages(session.id)).length,
      })),
    );
    return noStoreJson({ sessions: enriched });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "sessions-create", 40);
  if (blocked) return blocked;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const title = String(body.title || "Sesi investigasi baru").trim().slice(0, 200);
    const mode = String(body.mode || "learning") as SessionMode;
    const language = body.language === "en" ? "en" : "id";
    const provider = String(body.provider || "local") as ProviderId;
    const model = String(body.model || "auto").trim().slice(0, 160);
    const challengeId = body.challengeId ? String(body.challengeId) : undefined;
    if (!MODES.includes(mode)) throw new Error("Mode sesi tidak valid.");
    if (!PROVIDERS.includes(provider)) throw new Error("Provider tidak valid.");
    if (challengeId) {
      const challenge = await getChallenge(challengeId);
      if (!challenge) throw new Error("Challenge tidak ditemukan.");
    }
    const session = await createSession({ title: title || "Sesi investigasi baru", mode, language, provider, model, challengeId });
    return noStoreJson({ session }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
