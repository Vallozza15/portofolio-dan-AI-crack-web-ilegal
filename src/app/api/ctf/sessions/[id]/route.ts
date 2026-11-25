import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import {
  deleteSession,
  getChallenge,
  getSession,
  listEvidence,
  listHypotheses,
  listIntents,
  listMessages,
  listReasoningChecks,
  listReasoningContexts,
} from "@/lib/ctf/store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "session-get", 120);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const session = await getSession(id);
    if (!session) return noStoreJson({ error: "Sesi tidak ditemukan." }, { status: 404 });
    const [messages, evidence, challenge, reasoningContexts, intents, hypotheses, reasoningChecks] =
      await Promise.all([
        listMessages(id),
        listEvidence({ sessionId: id }),
        session.challengeId ? getChallenge(session.challengeId) : Promise.resolve(null),
        listReasoningContexts(id),
        listIntents(id),
        listHypotheses(id),
        listReasoningChecks(id),
      ]);
    return noStoreJson({
      session,
      messages,
      evidence,
      challenge,
      reasoningContexts,
      intents,
      hypotheses,
      reasoningChecks,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "session-delete", 30);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const removed = await deleteSession(id);
    if (!removed) return noStoreJson({ error: "Sesi tidak ditemukan." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
