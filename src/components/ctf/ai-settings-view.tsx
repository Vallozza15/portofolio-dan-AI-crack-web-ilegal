"use client";

import { useState } from "react";
import { Bot, Check, Eye, EyeOff, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, ErrorBanner, Field, PageHeader, Panel, Toggle } from "./ui";
import { cn } from "@/lib/ctf/format";
import type { ProviderId } from "@/lib/ctf/types";
import type { PublicSettings } from "@/lib/ctf/settings";

const PROVIDER_META: Record<string, { description: string; docs: string; keyLabel: string }> = {
  openai: {
    description: "Chat Completions API dengan streaming SSE.",
    docs: "https://platform.openai.com/docs/api-reference",
    keyLabel: "OPENAI_API_KEY",
  },
  anthropic: {
    description: "Messages API dengan header anthropic-version.",
    docs: "https://docs.anthropic.com/en/api/messages",
    keyLabel: "ANTHROPIC_API_KEY",
  },
  gemini: {
    description: "generateContent dengan alt=sse.",
    docs: "https://ai.google.dev/api/generate-content",
    keyLabel: "GEMINI_API_KEY",
  },
  ollama: {
    description: "Server lokal /api/chat. Tidak memerlukan API key.",
    docs: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    keyLabel: "—",
  },
  compatible: {
    description: "Endpoint OpenAI-compatible (OpenRouter, vLLM, LM Studio, dsb).",
    docs: "",
    keyLabel: "opsional",
  },
};

interface DraftState {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
  clearKey: boolean;
}

export function AiSettingsView({ settings }: { settings: PublicSettings }) {
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(
    Object.fromEntries(
      settings.ai.providers.map((provider) => [
        provider.id,
        {
          enabled: provider.enabled,
          baseUrl: provider.baseUrl,
          model: provider.model,
          temperature: provider.temperature,
          maxTokens: provider.maxTokens,
          apiKey: "",
          clearKey: false,
        },
      ]),
    ),
  );
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>(settings.ai.defaultProvider);
  const [fallbackOrder, setFallbackOrder] = useState<ProviderId[]>(settings.ai.fallbackOrder);
  const [customInstructions, setCustomInstructions] = useState(settings.ai.customInstructions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const update = (id: string, patch: Partial<DraftState>) => {
    setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ctf/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai: {
            providers: settings.ai.providers.map((provider) => {
              const draft = drafts[provider.id];
              return {
                id: provider.id,
                enabled: draft.enabled,
                baseUrl: draft.baseUrl,
                model: draft.model,
                temperature: draft.temperature,
                maxTokens: draft.maxTokens,
                apiKey: draft.apiKey || undefined,
                clearKey: draft.clearKey,
              };
            }),
            defaultProvider,
            fallbackOrder,
            customInstructions,
          },
        }),
      });
      const payload = (await response.json()) as { settings?: PublicSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error || "Gagal menyimpan.");
      setMessage("Pengaturan AI disimpan. API key baru telah dienkripsi di server.");
      setDrafts((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([id, draft]) => [id, { ...draft, apiKey: "", clearKey: false }]),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const moveFallback = (id: ProviderId, direction: -1 | 1) => {
    const index = fallbackOrder.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fallbackOrder.length) return;
    const next = [...fallbackOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setFallbackOrder(next);
  };

  return (
    <div>
      <PageHeader
        eyebrow="AI SETTINGS"
        title="Provider & model configuration"
        description="API key dienkripsi AES-256-GCM di server dan tidak pernah dikirim ke browser. Jika provider gagal atau belum siap, sistem jatuh ke Local Analyst deterministik."
        actions={
          <button type="button" className="ctf-btn ctf-btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Simpan
          </button>
        }
      />

      {(error || message) && (
        <div className="mb-4 space-y-2">
          <ErrorBanner message={error} />
          {message && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[rgba(52,211,153,0.3)] bg-[rgba(6,78,59,0.18)] px-3 py-2 text-[11.5px] text-[#a7f3d0]">
              <Check size={13} /> {message}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {settings.ai.providers.map((provider) => {
            const draft = drafts[provider.id];
            const meta = PROVIDER_META[provider.id];
            const status = settings.providerStatus.find((item) => item.id === provider.id);
            return (
              <Panel
                key={provider.id}
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{provider.label}</span>
                    <Badge tone={status?.configured ? "green" : "rose"}>{status?.configured ? "READY" : "OFF"}</Badge>
                    {provider.keySource !== "none" && <Badge tone="cyan">key: {provider.keySource}</Badge>}
                  </div>
                }
                subtitle={meta?.description}
              >
                <div className="space-y-3">
                  <Toggle
                    checked={draft.enabled}
                    onChange={(value) => update(provider.id, { enabled: value })}
                    label="Aktifkan provider"
                    description="Provider tetap dipakai hanya jika konfigurasi lengkap saat permintaan."
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Base URL">
                      <input
                        className="ctf-input ctf-mono"
                        value={draft.baseUrl}
                        onChange={(event) => update(provider.id, { baseUrl: event.target.value })}
                        placeholder="https://…"
                      />
                    </Field>
                    <Field label="Model">
                      <input
                        className="ctf-input ctf-mono"
                        value={draft.model}
                        onChange={(event) => update(provider.id, { model: event.target.value })}
                        placeholder="model-id"
                      />
                    </Field>
                  </div>
                  {provider.id !== "ollama" && (
                    <Field label={`API key (${meta?.keyLabel || "API_KEY"})`} hint="Kosongkan untuk mempertahankan key lama. Disimpan terenkripsi.">
                      <div className="flex gap-2">
                        <input
                          className="ctf-input ctf-mono flex-1"
                          type={showKeys[provider.id] ? "text" : "password"}
                          autoComplete="off"
                          value={draft.apiKey}
                          onChange={(event) => update(provider.id, { apiKey: event.target.value })}
                          placeholder={provider.hasKey ? "•••••••• (tersimpan)" : "Masukkan API key"}
                        />
                        <button type="button" className="ctf-btn" onClick={() => setShowKeys((previous) => ({ ...previous, [provider.id]: !previous[provider.id] }))}>
                          {showKeys[provider.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        {provider.hasKey && (
                          <button
                            type="button"
                            className={cn("ctf-btn", draft.clearKey && "ctf-btn-danger")}
                            onClick={() => update(provider.id, { clearKey: !draft.clearKey })}
                            title="Hapus key tersimpan"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      {draft.clearKey && <span className="mt-1 block text-[10px] text-[#fda4af]">Key tersimpan akan dihapus saat disimpan.</span>}
                    </Field>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label={`Temperature · ${draft.temperature.toFixed(2)}`}>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={draft.temperature}
                        onChange={(event) => update(provider.id, { temperature: Number(event.target.value) })}
                        className="w-full accent-[var(--ctf-green)]"
                      />
                    </Field>
                    <Field label="Max tokens">
                      <input
                        className="ctf-input ctf-mono"
                        type="number"
                        min={256}
                        max={32000}
                        step={128}
                        value={draft.maxTokens}
                        onChange={(event) => update(provider.id, { maxTokens: Number(event.target.value) })}
                      />
                    </Field>
                  </div>
                  {status && <p className="text-[10px] leading-relaxed text-[var(--ctf-dim)]">{status.note}</p>}
                </div>
              </Panel>
            );
          })}

          <Panel title="Custom instructions" subtitle="Ditambahkan ke system prompt setiap permintaan. Maks 4000 karakter.">
            <textarea
              className="ctf-textarea min-h-[110px]"
              value={customInstructions}
              maxLength={4000}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Contoh: selalu sebutkan command yang dapat diverifikasi ulang…"
            />
            <div className="mt-1 text-right text-[9.5px] text-[var(--ctf-dim)]">{customInstructions.length}/4000</div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Routing" subtitle="Provider default dan urutan fallback.">
            <div className="space-y-3">
              <Field label="Provider default">
                <select className="ctf-select" value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value as ProviderId)}>
                  {settings.ai.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.label}</option>
                  ))}
                  <option value="local">Local Analyst (deterministik)</option>
                </select>
              </Field>
              <div>
                <div className="ctf-label mb-1.5">Fallback order</div>
                <div className="space-y-1">
                  {fallbackOrder.map((id, index) => {
                    const provider = settings.ai.providers.find((item) => item.id === id);
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 rounded border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] px-2 py-1.5">
                        <span className="text-[10.5px] text-[#d1fae5]">
                          <span className="ctf-mono mr-1.5 text-[9px] text-[var(--ctf-dim)]">{index + 1}</span>
                          {provider?.label || "Local Analyst"}
                        </span>
                        <span className="flex gap-1">
                          <button type="button" className="px-1 text-[var(--ctf-dim)] hover:text-white" onClick={() => moveFallback(id, -1)}>↑</button>
                          <button type="button" className="px-1 text-[var(--ctf-dim)] hover:text-white" onClick={() => moveFallback(id, 1)}>↓</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Keamanan key" noPadding>
            <div className="space-y-2 p-4 text-[10px] leading-relaxed text-[var(--ctf-muted)]">
              <p className="flex gap-1.5"><ShieldCheck size={12} className="mt-0.5 shrink-0 text-[var(--ctf-green)]" /> Enkripsi AES-256-GCM dengan master key dari CTF_MASTER_KEY atau file lokal 0600.</p>
              <p className="flex gap-1.5"><Bot size={12} className="mt-0.5 shrink-0 text-[var(--ctf-cyan)]" /> Key tidak pernah dikirim ke browser; hanya status hasKey.</p>
              <p>• Environment variable juga didukung dan tidak ditimpa.</p>
              <p>• Hapus key dengan tombol trash lalu simpan.</p>
              <p>• Rotasi CTF_MASTER_KEY membuat key tersimpan tidak dapat didekripsi.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
