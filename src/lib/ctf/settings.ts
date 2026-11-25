import { decryptSecret, encryptSecret, getPublicProviderConfigs, getProviderStatuses } from "./ai";
import { getPostgresStatus, type PgStatus } from "./pg";
import { getSettings, updateSettings } from "./store";
import type { CtfSettings, ProviderId, SystemSettings } from "./types";

const PROVIDER_IDS: ProviderId[] = ["openai", "anthropic", "gemini", "ollama", "compatible"];

export interface PublicProviderSettings {
  id: ProviderId;
  label: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  hasKey: boolean;
  keySource: "saved" | "env" | "none";
  available: boolean;
}

export interface PublicSettings {
  ai: {
    providers: PublicProviderSettings[];
    defaultProvider: ProviderId;
    fallbackOrder: ProviderId[];
    customInstructions: string;
  };
  system: SystemSettings;
  updatedAt: string;
  providerStatus: Awaited<ReturnType<typeof getProviderStatuses>>;
  authEnabled: boolean;
  envMasterKey: boolean;
  database: PgStatus & { backend: "postgres" | "json" };
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await getSettings();
  const publicProviders = await getPublicProviderConfigs();
  const pg = await getPostgresStatus();
  return {
    ai: {
      providers: publicProviders.map((provider) => ({
        id: provider.id,
        label: provider.label,
        enabled: provider.enabled,
        baseUrl: provider.baseUrl,
        model: provider.model,
        temperature: provider.temperature,
        maxTokens: provider.maxTokens,
        hasKey: provider.hasKey,
        keySource: provider.keySource,
        available: provider.available,
      })),
      defaultProvider: settings.ai.defaultProvider,
      fallbackOrder: settings.ai.fallbackOrder,
      customInstructions: settings.ai.customInstructions,
    },
    system: settings.system,
    updatedAt: settings.updatedAt,
    providerStatus: await getProviderStatuses(),
    authEnabled: Boolean(process.env.CTF_ACCESS_PASSWORD),
    envMasterKey: Boolean(process.env.CTF_MASTER_KEY),
    database: { ...pg, backend: pg.configured ? "postgres" : "json" },
  };
}

export interface ProviderPatch {
  id: ProviderId;
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  clearKey?: boolean;
}

export interface AiSettingsPatch {
  providers?: ProviderPatch[];
  defaultProvider?: ProviderId;
  fallbackOrder?: ProviderId[];
  customInstructions?: string;
}

function validateUrl(value: string): string {
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Base URL tidak valid: ${value}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Base URL harus menggunakan http:// atau https://.");
  }
  if (url.username || url.password) {
    throw new Error("Base URL tidak boleh memuat kredensial.");
  }
  return url.toString().replace(/\/+$/, "");
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export async function saveAiSettings(patch: AiSettingsPatch): Promise<PublicSettings> {
  const settings = await getSettings();
  const providers = settings.ai.providers.map((provider) => ({ ...provider }));

  for (const incoming of patch.providers || []) {
    if (!PROVIDER_IDS.includes(incoming.id)) continue;
    const provider = providers.find((item) => item.id === incoming.id);
    if (!provider) continue;
    if (typeof incoming.enabled === "boolean") provider.enabled = incoming.enabled;
    if (typeof incoming.baseUrl === "string") {
      provider.baseUrl = validateUrl(incoming.baseUrl);
    }
    if (typeof incoming.model === "string") {
      provider.model = incoming.model.trim().slice(0, 160);
    }
    if (incoming.temperature !== undefined) {
      provider.temperature = clampNumber(incoming.temperature, 0, 2, provider.temperature);
    }
    if (incoming.maxTokens !== undefined) {
      provider.maxTokens = Math.round(clampNumber(incoming.maxTokens, 256, 32_000, provider.maxTokens));
    }
    if (incoming.clearKey) {
      provider.apiKeyEnc = undefined;
    } else if (typeof incoming.apiKey === "string" && incoming.apiKey.trim()) {
      const key = incoming.apiKey.trim();
      if (key.length > 4096) throw new Error("API key terlalu panjang.");
      provider.apiKeyEnc = await encryptSecret(key);
    }
  }

  const defaultProvider =
    patch.defaultProvider && [...PROVIDER_IDS, "local"].includes(patch.defaultProvider)
      ? patch.defaultProvider
      : settings.ai.defaultProvider;

  const fallbackOrder = Array.isArray(patch.fallbackOrder)
    ? patch.fallbackOrder.filter(
        (id, index, array) =>
          [...PROVIDER_IDS, "local"].includes(id) && array.indexOf(id) === index,
      )
    : settings.ai.fallbackOrder;

  const customInstructions =
    typeof patch.customInstructions === "string"
      ? patch.customInstructions.slice(0, 4000)
      : settings.ai.customInstructions;

  await updateSettings({
    ai: {
      ...settings.ai,
      providers,
      defaultProvider,
      fallbackOrder,
      customInstructions,
    },
  });
  return getPublicSettings();
}

export async function saveSystemSettings(patch: Partial<SystemSettings>): Promise<PublicSettings> {
  const settings = await getSettings();
  const next: SystemSettings = {
    defaultLanguage: patch.defaultLanguage === "en" ? "en" : settings.system.defaultLanguage,
    maxUploadMb: Math.round(clampNumber(patch.maxUploadMb ?? settings.system.maxUploadMb, 1, 200, settings.system.maxUploadMb)),
    allowPrivateHttp:
      typeof patch.allowPrivateHttp === "boolean"
        ? patch.allowPrivateHttp
        : settings.system.allowPrivateHttp,
    hostToolsEnabled:
      typeof patch.hostToolsEnabled === "boolean"
        ? patch.hostToolsEnabled
        : settings.system.hostToolsEnabled,
    sandboxEnabled:
      typeof patch.sandboxEnabled === "boolean"
        ? patch.sandboxEnabled
        : settings.system.sandboxEnabled,
    retainDays: Math.round(clampNumber(patch.retainDays ?? settings.system.retainDays, 1, 3650, settings.system.retainDays)),
  };
  await updateSettings({ system: next });
  return getPublicSettings();
}

export async function revealStoredKey(id: ProviderId): Promise<string | null> {
  const settings = await getSettings();
  const provider = settings.ai.providers.find((item) => item.id === id);
  if (!provider?.apiKeyEnc) return null;
  try {
    return await decryptSecret(provider.apiKeyEnc);
  } catch {
    return null;
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function safeSettingsForLog(settings: CtfSettings) {
  return {
    defaultProvider: settings.ai.defaultProvider,
    fallbackOrder: settings.ai.fallbackOrder,
    providers: settings.ai.providers.map((provider) => ({
      id: provider.id,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      hasKey: Boolean(provider.apiKeyEnc),
    })),
    system: settings.system,
  };
}
