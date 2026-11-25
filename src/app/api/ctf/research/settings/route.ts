import { errorResponse, guard, noStoreJson, readJson } from "@/lib/ctf/api";
import { getPublicResearchSettings, saveResearchSettings } from "@/lib/ctf/research/settings";
import type { ResearchSettingsPatch } from "@/lib/ctf/research/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guard(request, "research-settings-read", 90);
  if (blocked) return blocked;
  try {
    return noStoreJson({ settings: await getPublicResearchSettings() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const blocked = await guard(request, "research-settings", 20);
  if (blocked) return blocked;
  try {
    const patch = await readJson<ResearchSettingsPatch>(request);
    const settings = await saveResearchSettings(patch);
    return noStoreJson({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
