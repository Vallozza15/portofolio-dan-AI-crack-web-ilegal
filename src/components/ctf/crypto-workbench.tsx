"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";
import { Badge, CopyButton, EmptyState, ErrorBanner, Field, PageHeader, Panel } from "./ui";
import { CRYPTO_OPERATION_GROUPS, CRYPTO_OPERATION_LABELS, CRYPTO_PARAM_FIELDS } from "@/lib/ctf/crypto-meta";
import { cn } from "@/lib/ctf/format";

interface StepState {
  id: string;
  operation: string;
  params: Record<string, string>;
  result?: { output: string; detail?: string; error?: string };
}

const QUICK_INPUTS = [
  { label: "Base64", value: "ZmxhZ3t0aGlzX2lzX2FfZGVtb30=" },
  { label: "Hex", value: "666c61677b6865785f64656d6f7d" },
  { label: "ROT13", value: "syn{sbb}" },
  { label: "Morse", value: "... . -.-. .-. . -" },
];

function defaultParams(operation: string): Record<string, string> {
  const fields = CRYPTO_PARAM_FIELDS[operation] || [];
  return Object.fromEntries(fields.map((field) => [field.key, field.defaultValue || ""]));
}

export function CryptoWorkbench() {
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [draftOperation, setDraftOperation] = useState("base64_decode");
  const [draftParams, setDraftParams] = useState<Record<string, string>>(defaultParams("base64_decode"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const draftFields = CRYPTO_PARAM_FIELDS[draftOperation] || [];

  const addStep = () => {
    setSteps((previous) => [
      ...previous,
      { id: `step-${Date.now()}`, operation: draftOperation, params: { ...draftParams } },
    ]);
    setError("");
  };

  const runAll = async () => {
    if (!input.trim()) {
      setError("Masukkan input terlebih dahulu.");
      return;
    }
    if (!steps.length) {
      setError("Tambahkan minimal satu langkah operasi.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ctf/crypto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          steps: steps.map((step) => ({ operation: step.operation, params: step.params })),
        }),
      });
      const payload = (await response.json()) as {
        result?: { output: string; steps?: Array<{ output: string; detail?: string; error?: string }> };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Operasi gagal.");
      const results = payload.result.steps || [];
      setSteps((previous) =>
        previous.map((step, index) => ({
          ...step,
          result: results[index]
            ? { output: results[index].output, detail: results[index].detail, error: results[index].error }
            : undefined,
        })),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSteps([]);
    setError("");
  };

  return (
    <div>
      <PageHeader
        eyebrow="CRYPTOGRAPHY LAB"
        title="Encoding & cipher workbench"
        description="Pipeline multi-langkah untuk encoding, cipher klasik, XOR, hash, AES edukasi, dan matematika RSA. Semua operasi dijalankan lokal di server dengan library Node.js, bukan simulasi."
        actions={
          <>
            <button type="button" className="ctf-btn" onClick={reset} disabled={busy}>
              <RotateCcw size={13} /> Reset
            </button>
            <button type="button" className="ctf-btn ctf-btn-primary" onClick={runAll} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Jalankan pipeline
            </button>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="Input" subtitle="Teks, ciphertext, atau data yang akan diproses.">
            <textarea
              className="ctf-textarea min-h-[140px]"
              placeholder="Tempel data di sini…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="ctf-label mr-1">Contoh:</span>
              {QUICK_INPUTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  className="rounded border border-[var(--ctf-line)] px-2 py-0.5 text-[9.5px] text-[var(--ctf-muted)] hover:border-[rgba(52,211,153,0.4)] hover:text-[#a7f3d0]"
                  onClick={() => setInput(sample.value)}
                >
                  {sample.label}
                </button>
              ))}
              <span className="ml-auto text-[9.5px] text-[var(--ctf-dim)]">{input.length} karakter</span>
            </div>
          </Panel>

          <Panel
            title="Pipeline"
            subtitle="Langkah dijalankan berurutan; output satu langkah menjadi input berikutnya."
            actions={
              steps.length ? (
                <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-ghost" onClick={reset}>
                  <Trash2 size={12} /> Bersihkan
                </button>
              ) : undefined
            }
          >
            {steps.length ? (
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div key={step.id} className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="ctf-mono flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--ctf-line)] text-[9px] text-[var(--ctf-green)]">
                          {index + 1}
                        </span>
                        <span className="truncate text-[11.5px] text-[#d1fae5]">
                          {CRYPTO_OPERATION_LABELS[step.operation] || step.operation}
                        </span>
                        {Object.entries(step.params).filter(([, value]) => value).map(([key, value]) => (
                          <Badge key={key}>{key}={value.length > 18 ? `${value.slice(0, 18)}…` : value}</Badge>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="text-[var(--ctf-dim)] hover:text-[#fda4af]"
                        onClick={() => setSteps((previous) => previous.filter((item) => item.id !== step.id))}
                        aria-label="Hapus langkah"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {step.result && (
                      <div className="mt-2">
                        {step.result.error ? (
                          <p className="text-[10.5px] text-[#fda4af]">{step.result.error}</p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="ctf-label">Output</span>
                              <CopyButton value={step.result.output} label="" />
                            </div>
                            <pre className="ctf-code ctf-scroll mt-1 max-h-48 whitespace-pre-wrap break-all">{step.result.output}</pre>
                            {step.result.detail && (
                              <pre className="ctf-code ctf-scroll mt-1 max-h-32 whitespace-pre-wrap break-all opacity-70">{step.result.detail}</pre>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Pipeline kosong"
                description="Pilih operasi di panel kanan lalu tambahkan ke pipeline."
              />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Tambah langkah" subtitle="Pilih operasi dan atur parameter.">
            <div className="space-y-3">
              <Field label="Operasi">
                <select
                  className="ctf-select"
                  value={draftOperation}
                  onChange={(event) => {
                    setDraftOperation(event.target.value);
                    setDraftParams(defaultParams(event.target.value));
                  }}
                >
                  {CRYPTO_OPERATION_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.operations.map((operation) => (
                        <option key={operation.id} value={operation.id}>{operation.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              {draftFields.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  {field.kind === "select" ? (
                    <select
                      className="ctf-select"
                      value={draftParams[field.key] || field.defaultValue || ""}
                      onChange={(event) => setDraftParams({ ...draftParams, [field.key]: event.target.value })}
                    >
                      {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : field.kind === "textarea" ? (
                    <textarea
                      className="ctf-textarea min-h-[70px]"
                      placeholder={field.placeholder}
                      value={draftParams[field.key] || ""}
                      onChange={(event) => setDraftParams({ ...draftParams, [field.key]: event.target.value })}
                    />
                  ) : (
                    <input
                      className={cn("ctf-input", field.kind === "number" && "ctf-mono")}
                      type={field.kind === "number" ? "number" : "text"}
                      placeholder={field.placeholder}
                      value={draftParams[field.key] || ""}
                      onChange={(event) => setDraftParams({ ...draftParams, [field.key]: event.target.value })}
                    />
                  )}
                </Field>
              ))}
              <button type="button" className="ctf-btn w-full" onClick={addStep}>
                <ArrowRight size={13} /> Tambah ke pipeline
              </button>
            </div>
          </Panel>

          <Panel title="Referensi" noPadding>
            <div className="space-y-1.5 p-4 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
              <p>• AES mendukung CBC, GCM (dengan auth tag), dan ECB untuk edukasi.</p>
              <p>• RSA memakai aritmetika BigInt lokal dan faktorisasi trial division hingga 2 juta.</p>
              <p>• Auto-decode berhenti ketika lapisan berikutnya tidak valid.</p>
              <p>• Operasi hanya membaca input yang Anda berikan; tidak ada koneksi eksternal.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
