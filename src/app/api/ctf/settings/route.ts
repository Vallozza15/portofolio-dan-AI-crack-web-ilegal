import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { audit, getSettings } from "@/lib/ctf/store";
import { getPublicSettings, saveAiSettings, saveSystemSettings, type AiSettingsPatch } from "@/lib/ctf/settings";
import type { SystemSettings } from "@/lib/ctf/types";

export async function GET(request: Request) {
  const blocked = await guard(request, "settings-get", 60);
  if (blocked) return blocked;
  try {
    return noStoreJson({ settings: await getPublicSettings() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function PATCH(request: Request) {
  const blocked = await guard(request, "settings-update", 20);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ ai?: AiSettingsPatch; system?: Partial<SystemSettings> }>(request);
    const before = await getSettings();
    if (body.ai) {
      await saveAiSettings(body.ai);
      await audit("settings.ai", `default=${body.ai.defaultProvider || before.ai.defaultProvider}`);
    }
    if (body.system) {
      await saveSystemSettings(body.system);
      await audit(
        "settings.system",
        `hostTools=${body.system.hostToolsEnabled ?? before.system.hostToolsEnabled} sandbox=${body.system.sandboxEnabled ?? before.system.sandboxEnabled} allowPrivateHttp=${body.system.allowPrivateHttp ?? before.system.allowPrivateHttp}`,
      );
    }
    return noStoreJson({ settings: await getPublicSettings() });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
