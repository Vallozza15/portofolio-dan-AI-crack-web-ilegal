import { analyzeText } from "./analyzer";
import {
  addEvidence,
  addFlag,
  addMessage,
  audit,
  listEvidence,
  listFlags,
  updateSession,
} from "./store";
import { inferStatus } from "./status";
import type {
  Evidence,
  LocalAnalysisBundle,
  ProviderId,
  Session,
  SessionMode,
  VerificationStatus,
} from "./types";

export interface PersistEvidence {
  title: string;
  summary: string;
  detail: string;
  confidence: string;
}

function normalizeConfidence(value: string): Evidence["confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function dedupeCandidates(
  candidates: Array<{ value: string; format: string; source: string; confidence: number }>,
) {
  return [...new Map(candidates.map((candidate) => [candidate.value, candidate])).values()].sort(
    (a, b) => b.confidence - a.confidence,
  );
}

/**
 * Persists a completed assistant answer together with the evidence, flags and
 * session state produced by either the chat route or the Kali agent route.
 */
export async function persistAssistantReply(input: {
  session: Session;
  bundle?: LocalAnalysisBundle;
  full: string;
  provider: ProviderId;
  model: string;
  mode: SessionMode;
  fileIds: string[];
  userContent: string;
  extraEvidence?: PersistEvidence[];
  scope?: string;
}): Promise<{
  messageId: string;
  evidenceIds: string[];
  status: VerificationStatus;
  flag?: string;
}> {
  const status = inferStatus(input.full, input.bundle, input.extraEvidence);
  const saved = await addMessage({
    sessionId: input.session.id,
    role: "assistant",
    content: input.full,
    provider: input.provider,
    model: input.model,
    mode: input.mode,
    status,
    evidenceIds: input.fileIds,
  });

  const evidenceIds: string[] = [];
  const existing = await listEvidence({ sessionId: input.session.id });
  const keys = new Set(existing.map((item) => `${item.title}|${item.summary}`));
  const addOne = async (item: {
    kind: string;
    title: string;
    summary: string;
    detail: string;
    confidence: string;
    fileId?: string;
  }) => {
    const key = `${item.title}|${item.summary}`;
    if (keys.has(key)) return;
    keys.add(key);
    const added = await addEvidence({
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      detail: item.detail,
      confidence: normalizeConfidence(item.confidence),
      sessionId: input.session.id,
      challengeId: input.session.challengeId,
      fileId: item.fileId,
    });
    evidenceIds.push(added.id);
  };

  if (input.bundle) {
    for (const item of input.bundle.evidence.slice(0, 16)) {
      await addOne({ ...item, kind: item.kind || "local" });
    }
  }
  for (const item of input.extraEvidence || []) {
    await addOne({ ...item, kind: "terminal" });
  }

  const terminalText = (input.extraEvidence || []).map((item) => item.detail).join("\n");
  const terminalAnalysis = terminalText
    ? analyzeText(terminalText, input.bundle?.challenge.flagFormat)
    : null;
  const candidates = dedupeCandidates([
    ...(input.bundle?.flagCandidates || []),
    ...(terminalAnalysis?.flagCandidates || []),
  ]);
  const top = candidates[0];
  let flag: string | undefined;
  if (top && status !== "UNSOLVED") {
    flag = top.value;
    const flags = await listFlags();
    const exists = flags.some(
      (record) =>
        record.value === top.value &&
        (record.sessionId === input.session.id ||
          (input.session.challengeId && record.challengeId === input.session.challengeId)),
    );
    if (!exists) {
      await addFlag({
        challengeId: input.session.challengeId,
        sessionId: input.session.id,
        value: top.value,
        format: top.format,
        source: top.source,
        confidence: top.confidence,
        status,
        evidenceIds,
      });
    }
  }

  const nextTitle =
    input.session.title === "Sesi investigasi baru" || input.session.title === "Sesi baru"
      ? input.userContent.slice(0, 90)
      : input.session.title;
  await updateSession(input.session.id, {
    status,
    provider: input.provider,
    model: input.model,
    title: nextTitle,
  });
  await audit(input.scope || "chat.message", `${input.session.id}: ${status} via ${input.provider}`);

  return { messageId: saved.id, evidenceIds, status, flag };
}
