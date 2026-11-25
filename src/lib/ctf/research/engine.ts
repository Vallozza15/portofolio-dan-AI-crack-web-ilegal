import { newId, nowIso } from "../store";
import { retrieveSource } from "./extract";
import { buildIdentity } from "./identity";
import { buildSearchQueries } from "./queries";
import { collectSearchResults } from "./providers";
import { saveResearchSession } from "./store";
import type {
  ChallengeIdentity,
  OfficialValidation,
  ResearchApiConfig,
  ResearchEvent,
  ResearchSession,
  ResearchSource,
  SearchResultItem,
} from "./types";
import { crossValidate, formatFinalAnswer } from "./validation";

export interface ResearchInput {
  title: string;
  platform: string;
  category?: string;
  url?: string;
  description?: string;
  artifacts?: string[];
  seedUrls?: string[];
  maxSources?: number;
  officialValidation?: OfficialValidation;
}

export interface ResearchRunOptions {
  config: ResearchApiConfig;
  emit: (event: ResearchEvent) => void;
  signal?: AbortSignal;
}

function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Riset dibatalkan.");
}

async function retrieveBatch(
  items: SearchResultItem[],
  identity: ChallengeIdentity,
): Promise<ResearchSource[]> {
  return Promise.all(items.map((item) => retrieveSource(item, identity)));
}

/** Web-research-first pipeline. It never invents sources, flags, or progress. */
export async function runResearch(
  input: ResearchInput,
  options: ResearchRunOptions,
): Promise<ResearchSession> {
  const { emit, signal, config } = options;
  checkSignal(signal);
  const createdAt = nowIso();
  const events: ResearchEvent[] = [];
  const send = (event: ResearchEvent) => {
    events.push(event);
    emit(event);
  };

  send({ type: "stage", stage: "identity", message: "Mengidentifikasi judul, platform, event, dan format flag dari input." });
  const identity = buildIdentity({
    title: input.title,
    platform: input.platform,
    category: input.category,
    url: input.url,
    description: input.description,
    artifacts: input.artifacts,
  });
  send({ type: "identity", identity });

  const queries = buildSearchQueries(identity);
  send({ type: "stage", stage: "discovery", message: `${queries.length} query disusun dari identitas challenge.` });
  const results = await collectSearchResults(queries, config, send, signal, input.seedUrls || []);
  send({ type: "stage", stage: "retrieval", message: `${results.length} hasil unik ditemukan; mengambil halaman publik yang dapat diakses.` });

  const limit = Math.max(1, Math.min(input.maxSources || 16, 24));
  const sources: ResearchSource[] = [];
  for (let index = 0; index < Math.min(results.length, limit); index += 4) {
    checkSignal(signal);
    const batch = await retrieveBatch(results.slice(index, index + 4), identity);
    for (const source of batch) {
      sources.push(source);
      send({
        type: "source",
        url: source.url,
        title: source.title,
        retrieved: source.accessible,
        score: source.match?.score || 0,
        tier: source.match?.tier || "insufficient",
        candidateCount: source.candidateFlags.length,
      });
    }
  }

  send({ type: "stage", stage: "validation", message: "Membandingkan identitas sumber dan kandidat flag lintas sumber." });
  const cross = crossValidate(sources, identity, input.officialValidation);
  for (const candidate of cross.candidates) {
    send({
      type: "candidate",
      value: candidate.value,
      sources: candidate.sources.length,
      exactSources: candidate.exactSources.length,
    });
  }
  const answer = formatFinalAnswer(identity, cross, sources, "Public Write-up Discovery");
  send({ type: "status", status: cross.status });
  send({ type: "answer", answer });

  const fallbackReason =
    !cross.answer || cross.status === "UNVERIFIED" || cross.status === "CONFLICTING"
      ? cross.reasons.join(" ") || "Tidak ada jawaban publik yang memenuhi ambang verifikasi."
      : "";
  if (fallbackReason) {
    send({
      type: "fallback",
      reason: fallbackReason,
      challenge: {
        title: identity.challenge_title,
        platform: identity.platform,
        description: input.description || "",
      },
    });
  }

  const session: ResearchSession = {
    id: newId("research"),
    createdAt,
    updatedAt: nowIso(),
    input: {
      title: input.title,
      platform: input.platform,
      category: input.category || "",
      url: input.url || "",
      description: input.description || "",
      ...(input.seedUrls?.length ? { seedUrls: input.seedUrls.slice(0, 8) } : {}),
    },
    identity,
    queries,
    results,
    sources,
    candidates: cross.candidates,
    status: cross.status,
    answer,
    fallbackReason,
    events,
  };
  await saveResearchSession(session);
  send({ type: "done", sessionId: session.id });
  return session;
}
