import { getSettings, listChallenges, listFiles } from "./store";

export async function getLabData() {
  const [files, challenges, settings] = await Promise.all([listFiles(), listChallenges(), getSettings()]);
  return {
    files,
    challenges,
    maxUploadMb: settings.system.maxUploadMb,
    sandboxEnabled: settings.system.sandboxEnabled,
    hostToolsEnabled: settings.system.hostToolsEnabled,
    allowPrivateHttp: settings.system.allowPrivateHttp,
  };
}
