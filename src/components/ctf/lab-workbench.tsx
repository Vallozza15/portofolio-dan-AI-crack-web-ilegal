"use client";

import { useState, type ReactNode } from "react";
import { FileSearch, Lightbulb, ScanSearch, Sparkles } from "lucide-react";
import { Badge, EmptyState, ErrorBanner, Field, PageHeader, Panel, Spinner } from "./ui";
import { Dropzone } from "./dropzone";
import { FileAnalysisView } from "./file-analysis-view";
import { CATEGORY_LABELS, cn, formatBytes } from "@/lib/ctf/format";
import type { AnalyzeTextResult, Challenge, CtfCategory, StoredFile } from "@/lib/ctf/types";

export function LabWorkbench({
  category,
  eyebrow,
  title,
  description,
  guidance,
  files: initialFiles,
  challenges,
  maxUploadMb,
  children,
}: {
  category: CtfCategory;
  eyebrow: string;
  title: string;
  description: string;
  guidance: string[];
  files: StoredFile[];
  challenges: Challenge[];
  maxUploadMb: number;
  children?: ReactNode;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [challengeId, setChallengeId] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialFiles.find((file) => file.analysis?.categoryHints.includes(category))?.id || initialFiles[0]?.id || "",
  );
  const [text, setText] = useState("");
  const [textResult, setTextResult] = useState<AnalyzeTextResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const visibleFiles = files.filter(
    (file) =>
      (!challengeId || file.challengeId === challengeId) &&
      (file.analysis?.categoryHints.includes(category) || file.analysis?.categoryHints.includes("misc") || files.length <= 6),
  );
  const selected = files.find((file) => file.id === selectedId) || visibleFiles[0] || null;

  const analyzeText = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/ctf/analyze/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as { result?: AnalyzeTextResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Analisis gagal.");
      setTextResult(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={<Badge tone="violet">{CATEGORY_LABELS[category]}</Badge>}
      />
      {children}
      <div className={cn("grid gap-4", children ? "mt-4 xl:grid-cols-[minmax(0,1fr)_340px]" : "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0 space-y-4">
          <Panel title="Upload artefak" subtitle={`Analisis statis otomatis · maks ${maxUploadMb} MB · tidak dieksekusi`}>
            <div className="space-y-3">
              <Field label="Hubungkan ke challenge (opsional)">
                <select className="ctf-select" value={challengeId} onChange={(event) => setChallengeId(event.target.value)}>
                  <option value="">Tanpa challenge</option>
                  {challenges.map((challenge) => (
                    <option key={challenge.id} value={challenge.id}>{challenge.title}</option>
                  ))}
                </select>
              </Field>
              <Dropzone
                challengeId={challengeId || undefined}
                maxUploadMb={maxUploadMb}
                onUploaded={(file) => {
                  setFiles((previous) => [file, ...previous]);
                  setSelectedId(file.id);
                }}
              />
            </div>
          </Panel>

          <Panel title="Artefak teranalisis" subtitle={`${visibleFiles.length} file relevan`} noPadding>
            {visibleFiles.length ? (
              <div className="ctf-scroll max-h-52 overflow-y-auto p-2">
                {visibleFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedId(file.id)}
                    className={cn(
                      "mb-1 flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition",
                      file.id === selected?.id
                        ? "border-[rgba(52,211,153,0.35)] bg-[rgba(6,78,59,0.2)]"
                        : "border-transparent hover:border-[var(--ctf-line)] hover:bg-[rgba(14,33,51,0.45)]",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileSearch size={13} className="shrink-0 text-[var(--ctf-cyan)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] text-[#d1fae5]">{file.name}</span>
                        <span className="block text-[9.5px] text-[var(--ctf-dim)]">{file.magic} · {formatBytes(file.size)}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {file.analysis?.categoryHints.slice(0, 2).map((hint) => (
                        <Badge key={hint} tone="violet">{CATEGORY_LABELS[hint]}</Badge>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="Belum ada artefak" description="Unggah file di atas atau gunakan analisis teks cepat di panel kanan." />
              </div>
            )}
          </Panel>

          {selected?.analysis && (
            <Panel title={selected.name} subtitle={`${selected.magic} · ${formatBytes(selected.size)}`}>
              <FileAnalysisView analysis={selected.analysis} />
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Panduan investigasi" subtitle="Urutan pemeriksaan yang disarankan.">
            <ol className="space-y-2">
              {guidance.map((item, index) => (
                <li key={index} className="flex gap-2 text-[11px] leading-relaxed text-[var(--ctf-muted)]">
                  <span className="ctf-mono mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--ctf-line)] text-[8.5px] text-[var(--ctf-green)]">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Analisis teks cepat" subtitle="Ciphertext, deskripsi, atau output tool.">
            <div className="space-y-2">
              <textarea
                className="ctf-textarea"
                rows={7}
                placeholder="Tempel teks di sini…"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <button type="button" className="ctf-btn ctf-btn-primary w-full" onClick={analyzeText} disabled={analyzing || !text.trim()}>
                {analyzing ? <Spinner label="Menganalisis…" /> : <><ScanSearch size={13} /> Analisis</>}
              </button>
              <ErrorBanner message={error} />
            </div>
            {textResult && (
              <div className="mt-3 space-y-2 border-t border-[var(--ctf-line)] pt-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="violet">{CATEGORY_LABELS[textResult.category]}</Badge>
                  <Badge tone="cyan">conf {textResult.categoryConfidence}</Badge>
                  <Badge>{textResult.flagFormat}</Badge>
                </div>
                {textResult.flagCandidates.length > 0 && (
                  <div className="space-y-1">
                    {textResult.flagCandidates.slice(0, 4).map((candidate) => (
                      <div key={candidate.value} className="ctf-flag text-[10.5px]">{candidate.value}</div>
                    ))}
                  </div>
                )}
                {textResult.decodedLayers.length > 0 && (
                  <div className="space-y-1">
                    {textResult.decodedLayers.slice(0, 3).map((layer, index) => (
                      <div key={index} className="rounded border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-2">
                        <div className="text-[9.5px] text-[var(--ctf-cyan)]">{layer.operation}</div>
                        <div className="ctf-mono mt-1 line-clamp-3 break-all text-[9.5px] text-[var(--ctf-muted)]">{layer.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {textResult.notes.length > 0 && (
                  <ul className="space-y-1 text-[10px] text-[var(--ctf-dim)]">
                    {textResult.notes.map((note, index) => <li key={index}>• {note}</li>)}
                  </ul>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Catatan keamanan" noPadding>
            <div className="space-y-2 p-4 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
              <p className="flex gap-1.5"><Lightbulb size={12} className="mt-0.5 shrink-0 text-[var(--ctf-amber)]" /> Bukti file mengalahkan tebakan kata kunci.</p>
              <p className="flex gap-1.5"><Sparkles size={12} className="mt-0.5 shrink-0 text-[var(--ctf-green)]" /> Flag hanya VERIFIED jika cocok dengan expected flag.</p>
              <p className="flex gap-1.5"><ScanSearch size={12} className="mt-0.5 shrink-0 text-[var(--ctf-cyan)]" /> Parser lokal tidak menggantikan Ghidra, Wireshark, atau Volatility.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
