"use client";

import { useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Badge, EmptyState, ErrorBanner, Field, PageHeader, Panel, StatusBadge } from "./ui";
import { Markdown } from "./markdown";
import { CATEGORY_LABELS, formatDateTime } from "@/lib/ctf/format";
import type { Challenge, Report } from "@/lib/ctf/types";

export function ReportsView({
  reports: initialReports,
  challenges,
}: {
  reports: Report[];
  challenges: Challenge[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [selectedId, setSelectedId] = useState(initialReports[0]?.id || "");
  const [challengeId, setChallengeId] = useState(challenges[0]?.id || "");
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [mode, setMode] = useState<"learning" | "expert" | "hint">("learning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const selected = reports.find((report) => report.id === selectedId) || null;

  const create = async () => {
    if (!challengeId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ctf/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, language, mode }),
      });
      const payload = (await response.json()) as { report?: Report; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error || "Gagal membuat laporan.");
      setReports((previous) => [payload.report!, ...previous]);
      setSelectedId(payload.report.id);
      setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Hapus laporan ini?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ctf/reports/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Gagal menghapus laporan.");
      setReports((previous) => previous.filter((report) => report.id !== id));
      if (selectedId === id) setSelectedId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="REPORTS"
        title="Walkthrough & evidence archive"
        description="Laporan dibuat dari bukti lokal yang tersimpan. Ekspor Markdown dan PDF menggunakan data nyata, bukan template kosong."
        actions={
          <button type="button" className="ctf-btn ctf-btn-primary" onClick={() => setShowForm((value) => !value)}>
            <Plus size={13} /> Laporan baru
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {showForm && (
        <Panel title="Buat laporan" className="mb-4" actions={<button type="button" className="ctf-btn ctf-btn-sm ctf-btn-ghost" onClick={() => setShowForm(false)}><X size={12} /></button>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Challenge">
              <select className="ctf-select" value={challengeId} onChange={(event) => setChallengeId(event.target.value)}>
                {challenges.length ? challenges.map((challenge) => (
                  <option key={challenge.id} value={challenge.id}>{challenge.title}</option>
                )) : <option value="">Belum ada challenge</option>}
              </select>
            </Field>
            <Field label="Mode">
              <select className="ctf-select" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="learning">Learning</option>
                <option value="expert">Expert</option>
                <option value="hint">Hint</option>
              </select>
            </Field>
            <Field label="Bahasa">
              <select className="ctf-select" value={language} onChange={(event) => setLanguage(event.target.value as "id" | "en")}>
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          <button type="button" className="ctf-btn ctf-btn-primary mt-3" onClick={create} disabled={busy || !challengeId}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Generate dari bukti
          </button>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Arsip" subtitle={`${reports.length} laporan`} noPadding>
          {reports.length ? (
            <div className="ctf-scroll max-h-[600px] overflow-y-auto p-2">
              {reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  className={`mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition ${
                    report.id === selectedId
                      ? "border-[rgba(52,211,153,0.35)] bg-[rgba(6,78,59,0.2)]"
                      : "border-transparent hover:border-[var(--ctf-line)] hover:bg-[rgba(14,33,51,0.45)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[11px] font-medium text-[#e6f7f4]">{report.title}</span>
                    <StatusBadge status={report.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[var(--ctf-dim)]">
                    <Badge tone="violet">{CATEGORY_LABELS[report.category]}</Badge>
                    <span>{formatDateTime(report.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4"><EmptyState title="Belum ada laporan" description="Buat dari challenge yang memiliki file atau analisis." /></div>
          )}
        </Panel>

        {selected ? (
          <Panel
            title={selected.title}
            subtitle={`${CATEGORY_LABELS[selected.category]} · ${formatDateTime(selected.createdAt)}`}
            actions={
              <>
                <a className="ctf-btn ctf-btn-sm" href={`/api/ctf/reports/${selected.id}/export?format=md`}>
                  <Download size={12} /> Markdown
                </a>
                <a className="ctf-btn ctf-btn-sm" href={`/api/ctf/reports/${selected.id}/export?format=pdf`}>
                  <Download size={12} /> PDF
                </a>
                <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-danger" onClick={() => remove(selected.id)} disabled={busy}>
                  <Trash2 size={12} />
                </button>
              </>
            }
          >
            <Markdown content={selected.markdown} />
          </Panel>
        ) : (
          <Panel>
            <EmptyState title="Pilih laporan" description="Laporan berisi ringkasan bukti, proses, hasil, dan status verifikasi." />
          </Panel>
        )}
      </div>
    </div>
  );
}
