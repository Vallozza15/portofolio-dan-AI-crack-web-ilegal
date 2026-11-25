import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { runHostTool } from "@/lib/ctf/tools";

export async function POST(request: Request) {
  const blocked = await guard(request, "tools-run", 20);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ profileId?: string; fileId?: string }>(request);
    if (!body.profileId || !body.fileId) throw new Error("profileId dan fileId wajib diisi.");
    const result = await runHostTool(body.profileId, body.fileId);
    return noStoreJson({ result, blocked: Boolean(result.blocked) });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
