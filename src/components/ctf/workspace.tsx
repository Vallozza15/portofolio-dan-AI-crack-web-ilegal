"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Panel,
  StatusBadge,
} from "./ui";
import { Dropzone } from "./dropzone";
import { FileAnalysisView } from "./file-analysis-view";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  cn,
  formatBytes,
  formatDateTime,
} from "@/lib/ctf/format";
import type {
  AnalyzeTextResult,
  Challenge,
  CtfCategory,
  Difficulty,
  StoredFile,
  ToolRun,
} from "@/lib/ctf/types";

interface ChallengeForm {
  title: string;
  category: CtfCategory;
  description: string;
  difficulty: Difficulty;
  flagFormat: string;
  expectedFlag: string;
  source: string;
  tags: string;
}

const EMPTY_FORM: ChallengeForm = {
  title: "",
  category: "cryptography",
  description: "",
  difficulty: "unknown",
  flagFormat: "flag{...}",
  expectedFlag: "",
  source: "",
  tags: "",
};

export function WorkspaceView({
  challenges: initialChallenges,
  files: initialFiles,
  toolRuns,
  maxUploadMb,
  sandboxEnabled,
  hostToolsEnabled,
}: {
  challenges: Challenge[];
  files: StoredFile[];
  toolRuns: ToolRun[];
  maxUploadMb: number;
  sandboxEnabled: boolean;
  hostToolsEnabled: boolean;
}) {
  const [challenges, setChallenges] = useState(initialChallenges);
  const [files, setFiles] = useState(initialFiles);
  const [selectedId, setSelectedId] = useState(initialChallenges[0]?.id || "");
  const [selectedFileId, setSelectedFileId] = useState(initialFiles[0]?.id || "");
  const [showForm, setShowForm] = useState(initialChallenges.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChallengeForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [textResult, setTextResult] = useState<AnalyzeTextResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const challenge = challenges.find((item) => item.id === selectedId) || null;
  const challengeFiles = files.filter((file) => !selectedId || file.challengeId === selectedId);
  const selectedFile = files.find((file) => file.id === selectedFileId) || challengeFiles[0] || null;
  const analysis = selectedFile?.analysis;
  const relatedRuns = toolRuns.filter((run) => run.fileId && challengeFiles.some((file) => file.id === run.fileId)).slice(0, 8);

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category: challenge?.category || "cryptography" });
    setShowForm(true);
    setError("");
    setMessage("");
  };

  const startEdit = () => {
    if (!challenge) return;
    setEditingId(challenge.id);
    setForm({
      title: challenge.title,
      category: challenge.category,
      description: challenge.description,
      difficulty: challenge.difficulty,
      flagFormat: challenge.flagFormat,
      expectedFlag: challenge.expectedFlag || "",
      source: challenge.source || "",
      tags: challenge.tags.join(", "),
    });
    setShowForm(true);
  };

  const saveChallenge = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...form,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      const response = await fetch(editingId ? `/api/ctf/challenges/${editingId}` : "/api/ctf/challenges", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { challenge?: Challenge; error?: string };
      if (!response.ok || !data.challenge) throw new Error(data.error || "Gagal menyimpan challenge.");
      if (editingId) {
        setChallenges((previous) => previous.map((item) => (item.id === editingId ? data.challenge! : item)));
        setMessage("Challenge diperbarui.");
      } else {
        setChallenges((previous) => [data.challenge!, ...previous]);
        setSelectedId(data.challenge.id);
        setSelectedFileId("");
        setMessage("Challenge dibuat.");
      }
      setShowForm(false);
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const deleteChallenge = async () => {
    if (!challenge) return;
    if (!window.confirm(`Hapus challenge "${challenge.title}"? File tetap ada tetapi tidak terhubung.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ctf/challenges/${challenge.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Gagal menghapus challenge.");
      setChallenges((previous) => previous.filter((item) => item.id !== challenge.id));
      setSelectedId("");
      setSelectedFileId("");
      setMessage("Challenge dihapus.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const analyzeDescription = async () => {
    if (!challenge) return;
    setAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/ctf/analyze/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${challenge.title}\n${challenge.description}`,
          customFormat: challenge.flagFormat,
        }),
      });
      const data = (await response.json()) as { result?: AnalyzeTextResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "Analisis teks gagal.");
      setTextResult(data.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAnalyzing(false);
    }
  };

  const createReport = async () => {
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ctf/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, mode: "learning", language: "id" }),
      });
      const data = (await response.json()) as { report?: { id: string }; error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || "Gagal membuat laporan.");
      setMessage("Laporan dibuat. Buka halaman Reports untuk melihat atau mengekspor.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="CHALLENGE WORKSPACE"
        title="Ruang kerja investigasi"
        description="Simpan metadata challenge, unggah artefak, jalankan parser lokal, dan hubungkan bukti ke sesi AI. File tidak pernah dieksekusi di host."
        actions={
          <>
            <button type="button" className="ctf-btn ctf-btn-primary" onClick={startCreate}>
              <Plus size={14} /> Challenge baru
            </button>
            <Link href={challenge ? `/ctf/solver?challenge=${challenge.id}` : "/ctf/solver"} className="ctf-btn">
              <Sparkles size={14} /> Buka Solver
            </Link>
          </>
        }
      />

      {(error || message) && (
        <div className="mb-4 space-y-2">
          <ErrorBanner message={error} />
          {message && (
            <div className="rounded-lg border border-[rgba(52,211,153,0.3)] bg-[rgba(6,78,59,0.18)] px-3 py-2 text-[11.5px] text-[#a7f3d0]">
              {message}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Challenges" subtitle={`${challenges.length} tersimpan`} noPadding>
            <div className="ctf-scroll max-h-[420px] overflow-y-auto p-2">
              {challenges.length ? (
                challenges.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setSelectedFileId("");
                      setTextResult(null);
                      setShowForm(false);
                    }}
                    className={cn(
                      "mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition",
                      item.id === selectedId
                        ? "border-[rgba(52,211,153,0.35)] bg-[rgba(6,78,59,0.22)]"
                        : "border-transparent hover:border-[var(--ctf-line)] hover:bg-[rgba(14,33,51,0.5)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[11.5px] font-medium text-[#e6f7f4]">{item.title}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone="violet">{CATEGORY_LABELS[item.category]}</Badge>
                      <Badge>{DIFFICULTY_LABELS[item.difficulty]}</Badge>
                    </div>
                  </button>
                ))
              ) : (
                <p className="px-2 py-4 text-[11px] text-[var(--ctf-dim)]">Belum ada challenge. Buat satu untuk mulai.</p>
              )}
            </div>
          </Panel>

          {showForm && (
            <Panel
              title={editingId ? "Edit challenge" : "Challenge baru"}
              actions={
                <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-ghost" onClick={() => setShowForm(false)}>
                  <X size={12} />
                </button>
              }
            >
              <div className="space-y-3">
                <Field label="Judul">
                  <input className="ctf-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nama challenge" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Kategori">
                    <select className="ctf-select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CtfCategory })}>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Kesulitan">
                    <select className="ctf-select" value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as Difficulty })}>
                      {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Deskripsi">
                  <textarea className="ctf-textarea" rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Tempel deskripsi challenge, petunjuk, URL, atau ciphertext…" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Format flag">
                    <input className="ctf-input ctf-mono" value={form.flagFormat} onChange={(event) => setForm({ ...form, flagFormat: event.target.value })} />
                  </Field>
                  <Field label="Expected flag" hint="Opsional; hanya untuk verifikasi lokal.">
                    <input className="ctf-input ctf-mono" value={form.expectedFlag} onChange={(event) => setForm({ ...form, expectedFlag: event.target.value })} />
                  </Field>
                </div>
                <Field label="Sumber / event">
                  <input className="ctf-input" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Contoh: picoCTF 2024" />
                </Field>
                <Field label="Tags" hint="Pisahkan dengan koma.">
                  <input className="ctf-input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
                </Field>
                <button type="button" className="ctf-btn ctf-btn-primary w-full" onClick={saveChallenge} disabled={busy || !form.title.trim()}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
                  {editingId ? "Simpan perubahan" : "Buat challenge"}
                </button>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!challenge ? (
            <Panel>
              <EmptyState
                title="Pilih atau buat challenge"
                description="Workspace menyimpan konteks challenge dan menghubungkan file ke analisis lokal serta sesi AI."
                action={<button type="button" className="ctf-btn ctf-btn-primary" onClick={startCreate}><Plus size={14} /> Challenge baru</button>}
              />
            </Panel>
          ) : (
            <>
              <Panel
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{challenge.title}</span>
                    <StatusBadge status={challenge.status} />
                  </div>
                }
                subtitle={`${CATEGORY_LABELS[challenge.category]} · ${DIFFICULTY_LABELS[challenge.difficulty]} · ${challenge.source || "sumber tidak dicatat"}`}
                actions={
                  <>
                    <button type="button" className="ctf-btn ctf-btn-sm" onClick={startEdit}><Pencil size={12} /> Edit</button>
                    <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-danger" onClick={deleteChallenge} disabled={busy}><Trash2 size={12} /></button>
                  </>
                }
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--ctf-muted)]">
                      {challenge.description || "Tidak ada deskripsi."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge tone="cyan">flag: {challenge.flagFormat}</Badge>
                      {challenge.expectedFlag && <Badge tone="green">expected flag diset</Badge>}
                      {challenge.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="ctf-btn ctf-btn-sm" onClick={analyzeDescription} disabled={analyzing}>
                        {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        Analisis teks
                      </button>
                      <button type="button" className="ctf-btn ctf-btn-sm" onClick={createReport} disabled={busy}>
                        Buat laporan
                      </button>
                      <Link href={`/ctf/solver?challenge=${challenge.id}`} className="ctf-btn ctf-btn-sm">
                        Solver <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
                    <div className="ctf-label mb-2">Pipeline status</div>
                    <div className="space-y-1.5 text-[10.5px]">
                      <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Files</span><span className="ctf-mono text-[#a7f3d0]">{challengeFiles.length}</span></div>
                      <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Host tools</span><span className={hostToolsEnabled ? "text-[#fcd34d]" : "text-[var(--ctf-dim)]"}>{hostToolsEnabled ? "ON" : "OFF"}</span></div>
                      <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Docker sandbox</span><span className={sandboxEnabled ? "text-[#6ee7b7]" : "text-[var(--ctf-dim)]"}>{sandboxEnabled ? "ON" : "OFF"}</span></div>
                      <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Updated</span><span className="text-[var(--ctf-dim)]">{formatDateTime(challenge.updatedAt)}</span></div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="File Explorer — upload & analisis artefak" subtitle={`Maks ${maxUploadMb} MB. Analisis statis berjalan otomatis setelah upload.`}>
                <Dropzone
                  challengeId={challenge.id}
                  maxUploadMb={maxUploadMb}
                  onUploaded={(file) => {
                    setFiles((previous) => [file, ...previous]);
                    setSelectedFileId(file.id);
                    setMessage(`${file.name} diunggah dan dianalisis.`);
                  }}
                />
                {challengeFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {challengeFiles.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] transition",
                          file.id === selectedFile?.id
                            ? "border-[rgba(52,211,153,0.45)] bg-[rgba(6,78,59,0.25)] text-[#a7f3d0]"
                            : "border-[var(--ctf-line)] text-[var(--ctf-muted)] hover:text-[#d1fae5]",
                        )}
                        onClick={() => setSelectedFileId(file.id)}
                      >
                        {file.name} · {formatBytes(file.size)}
                      </button>
                    ))}
                  </div>
                )}
              </Panel>

              {analysis && selectedFile && (
                <Panel
                  title={selectedFile.name}
                  subtitle={`SHA-256 ${selectedFile.sha256.slice(0, 24)}… · ${formatDateTime(selectedFile.createdAt)}`}
                  actions={<a className="ctf-btn ctf-btn-sm" href={`/api/ctf/files/${selectedFile.id}?download=1`}>Download</a>}
                >
                  <FileAnalysisView analysis={analysis} />
                </Panel>
              )}

              {textResult && (
                <Panel title="Hasil analisis teks" subtitle="Heuristik kategori, decoding berlapis, dan kandidat flag dari deskripsi.">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="violet">{CATEGORY_LABELS[textResult.category]}</Badge>
                    <Badge tone="cyan">confidence {textResult.categoryConfidence}</Badge>
                    <Badge>{textResult.flagFormat}</Badge>
                    <StatusBadge status={textResult.status} />
                  </div>
                  {textResult.flagCandidates.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {textResult.flagCandidates.slice(0, 5).map((candidate) => (
                        <div key={candidate.value} className="ctf-flag">{candidate.value} <span className="text-[9px] text-[var(--ctf-dim)]">({candidate.source})</span></div>
                      ))}
                    </div>
                  )}
                  {textResult.decodedLayers.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {textResult.decodedLayers.slice(0, 5).map((layer, index) => (
                        <div key={index}>
                          <div className="text-[10px] text-[var(--ctf-muted)]">{layer.operation}</div>
                          <pre className="ctf-code mt-1 max-h-28 whitespace-pre-wrap break-all">{layer.value.slice(0, 1500)}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                  {textResult.notes.length > 0 && (
                    <ul className="mt-3 space-y-1 text-[10.5px] text-[var(--ctf-muted)]">
                      {textResult.notes.map((note, index) => <li key={index}>• {note}</li>)}
                    </ul>
                  )}
                </Panel>
              )}

              <Panel title="Aktivitas tool" subtitle="Hanya operasi yang benar-benar dijalankan yang dicatat." noPadding>
                {relatedRuns.length ? (
                  <div className="divide-y divide-[var(--ctf-line)]">
                    {relatedRuns.map((run) => (
                      <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="ctf-mono text-[10.5px] text-[#a7f3d0]">{run.tool}</div>
                          <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--ctf-muted)]">{run.summary}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={run.status === "ok" ? "green" : run.status === "blocked" ? "amber" : "rose"}>{run.status}</Badge>
                          <span className="text-[9px] text-[var(--ctf-dim)]">{run.durationMs} ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4"><EmptyState title="Belum ada tool run" description="Jalankan tool dari halaman Integrated Tools atau sandbox untuk mencatat aktivitas." /></div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
