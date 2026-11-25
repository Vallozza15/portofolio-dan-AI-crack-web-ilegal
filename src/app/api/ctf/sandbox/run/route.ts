import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { getSandboxStatus, listSandboxProfiles, runSandboxProfile } from "@/lib/ctf/sandbox";

export async function GET(request: Request) {
  const blocked = await guard(request, "sandbox-status", 60);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    return noStoreJson({
      sandbox: await getSandboxStatus(url.searchParams.get("force") === "1"),
      profiles: listSandboxProfiles(),
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "sandbox-run", 10);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ profileId?: string; fileId?: string }>(request);
    if (!body.profileId || !body.fileId) throw new Error("profileId dan fileId wajib diisi.");
    const result = await runSandboxProfile(body.profileId, body.fileId);
    return noStoreJson({ result });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
