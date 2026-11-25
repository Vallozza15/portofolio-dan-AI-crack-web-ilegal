import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptSecret, encryptSecret } from "../secrets";
import { getDataDir } from "../store";
import type {
  PublicResearchSettings,
  ResearchApiConfig,
  ResearchProvider,
  ResearchSettingsPatch,
} from "./types";

const PROVIDERS: ResearchProvider[] = ["github", "brave", "googleCse", "operator"];
const SETTINGS_FILE = () => path.join(getDataDir(), "research-settings.json");

interface StoredResearchSettings {
  provider: ResearchProvider;
  enabled: boolean;
  apiKeyEnc?: string;
  githubTokenEnc?: string;
  cx?: string;
}

function normalizeProvider(value: unknown, fallback: ResearchProvider): ResearchProvider {
  return typeof value === "string" && PROVIDERS.includes(value as ResearchProvider)
    ? (value as ResearchProvider)
    : fallback;
}

async function readStored(): Promise<StoredResearchSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredResearchSettings>;
    return {
      provider: normalizeProvider(parsed.provider, "github"),
      enabled: Boolean(parsed.enabled),
      apiKeyEnc: typeof parsed.apiKeyEnc === "string" ? parsed.apiKeyEnc : undefined,
      githubTokenEnc: typeof parsed.githubTokenEnc === "string" ? parsed.githubTokenEnc : undefined,
      cx: typeof parsed.cx === "string" ? parsed.cx.slice(0, 300) : "",
    };
  } catch {
    return { provider: "github", enabled: false };
  }
}

async function writeStored(settings: StoredResearchSettings): Promise<void> {
  const file = SETTINGS_FILE();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(settings, null, 2), "utf8");
  await rename(temp, file);
}

async function decryptMaybe(payload?: string): Promise<string> {
  if (!payload) return "";
  try {
    return await decryptSecret(payload);
  } catch {
    return "";
  }
}

export async function getResearchConfig(): Promise<ResearchApiConfig> {
  const stored = await readStored();
  return {
    provider: stored.provider,
    enabled: stored.enabled,
    apiKey: await decryptMaybe(stored.apiKeyEnc),
    githubToken: await decryptMaybe(stored.githubTokenEnc),
    cx: stored.cx || "",
  };
}

export async function getPublicResearchSettings(): Promise<PublicResearchSettings> {
  const stored = await readStored();
  return {
    provider: stored.provider,
    enabled: stored.enabled,
    hasKey: Boolean(stored.apiKeyEnc),
    hasGithubToken: Boolean(stored.githubTokenEnc),
    cx: stored.cx || "",
  };
}

/** Keys are encrypted with the shared master key and never returned to the UI. */
export async function saveResearchSettings(patch: ResearchSettingsPatch): Promise<PublicResearchSettings> {
  const stored = await readStored();
  stored.provider = normalizeProvider(patch.provider, stored.provider);
  if (typeof patch.enabled === "boolean") stored.enabled = patch.enabled;
  if (typeof patch.cx === "string") stored.cx = patch.cx.trim().slice(0, 300);
  if (patch.clearKey) stored.apiKeyEnc = undefined;
  else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    const key = patch.apiKey.trim();
    if (key.length > 4096) throw new Error("API key terlalu panjang.");
    stored.apiKeyEnc = await encryptSecret(key);
  }
  if (patch.clearGithubToken) stored.githubTokenEnc = undefined;
  else if (typeof patch.githubToken === "string" && patch.githubToken.trim()) {
    const token = patch.githubToken.trim();
    if (token.length > 4096) throw new Error("GitHub token terlalu panjang.");
    stored.githubTokenEnc = await encryptSecret(token);
  }
  await writeStored(stored);
  return getPublicResearchSettings();
}
