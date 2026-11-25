import { errorResponse, guard, noStoreJson } from "@/lib/ctf/api";
import { CTFChallengeClassifier } from "@/lib/ctf/autonomous/required-modules";
import type { ChallengeUnderstandingInput } from "@/lib/ctf/autonomous/universal-understanding";

export const runtime = "nodejs";

const classifier = new CTFChallengeClassifier();

/** Evidence-driven challenge understanding. Missing fields are reported, never invented. */
export async function POST(request: Request) {
  const blocked = await guard(request, "understanding", 40);
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as ChallengeUnderstandingInput;
    const understanding = classifier.understand({
      ...(body.title ? { title: String(body.title).slice(0, 500) } : {}),
      ...(body.description ? { description: String(body.description).slice(0, 40_000) } : {}),
      hints: (body.hints || []).slice(0, 50).map((item) => String(item).slice(0, 4_000)),
      instructions: (body.instructions || []).slice(0, 50).map((item) => String(item).slice(0, 4_000)),
      files: (body.files || []).slice(0, 100).map((file) => ({
        name: String(file.name || "").slice(0, 500),
        mimeType: file.mimeType?.slice(0, 200),
        detectedType: file.detectedType?.slice(0, 200),
      })),
      terminalOutputs: (body.terminalOutputs || []).slice(0, 50).map((item) => String(item).slice(0, 20_000)),
      sourceCode: (body.sourceCode || []).slice(0, 20).map((item) => String(item).slice(0, 20_000)),
      metadata: (body.metadata || []).slice(0, 50).map((item) => String(item).slice(0, 4_000)),
    });
    return noStoreJson({ understanding });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
