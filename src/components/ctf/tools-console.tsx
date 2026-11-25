"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, Terminal } from "lucide-react";
import { Badge, EmptyState, ErrorBanner, Field, PageHeader, Panel } from "./ui";
import { cn, formatBytes, formatDateTime } from "@/lib/ctf/format";
import type { SandboxStatus } from "@/lib/ctf/sandbox";
import type { StoredFile, ToolRun, ToolStatus } from "@/lib/ctf/types";

interface HostProfile {
  id: string;
  tool: string;
  label: string;
  timeoutMs: number;
}

interface SandboxProfile {
  id: string;
  label: string;
}

export function ToolsConsole({
  tools: initialTools,
  sandbox: initialSandbox,
  profiles: initialProfiles,
  sandboxProfiles,
  files,
  toolRuns,
  hostToolsEnabled,
  sandboxEnabled,
}: {
  tools: ToolStatus[];
  sandbox: SandboxStatus;
  profiles: HostProfile[];
  sandboxProfiles: SandboxProfile[];
  files: StoredFile[];
  toolRuns: ToolRun[];
  hostToolsEnabled: boolean;
  sandboxEnabled: boolean;
}) {
  const [tools, setTools] = useState(initialTools);
  const [sandbox, setSandbox] = useState(initialSandbox);
  const [runs, setRuns] = useState(toolRuns);
  const [fileId, setFileId] = useState(files[0]?.id || "");
  const [profileId, setProfileId] = useState(initialProfiles[0]?.id || "");
  const [sandboxProfileId, setSandboxProfileId] = useState(sandboxProfiles[0]?.id || "");
  const [busy, setBusy] = useState<"refresh" | "host" | "sandbox" | null>(null);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<{ title: string; command: string; body: string; status: string } | null>(null);
  const [filter, setFilter] = useState("");

  const installed = tools.filter((tool) => tool.installed).length;
  const selectedFile = files.find((file) => file.id === fileId);

  const grouped = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? tools.filter((tool) => `${tool.name} ${tool.category} ${tool.purpose}`.toLowerCase().includes(query))
      : tools;
    const map = new Map<string, ToolStatus[]>();
    for (const tool of filtered) {
      const list = map.get(tool.category) || [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return [...map.entries()];
  }, [tools, filter]);

  const refresh = async () => {
    setBusy("refresh");
    setError("");
    try {
      const response = await fetch("/api/ctf/tools?force=1");
      const payload = (await response.json()) as {
        tools?: ToolStatus[];
        sandbox?: SandboxStatus;
        error?: string;
      };
      if (!response.ok || !payload.tools) throw new Error(payload.error || "Gagal memuat status tool.");
      setTools(payload.tools);
      if (payload.sandbox) setSandbox(payload.sandbox);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const runHost = async () => {
    if (!fileId || !profileId) return;
    setBusy("host");
    setError("");
    setOutput(null);
    try {
      const response = await fetch("/api/ctf/tools/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, fileId }),
      });
      const payload = (await response.json()) as {
        result?: { output: string; command: string; run: ToolRun; blocked?: boolean };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Tool gagal dijalankan.");
      setOutput({
        title: payload.result.blocked ? "Diblokir oleh kebijakan" : "Output host tool",
        command: payload.result.command,
        body: payload.result.output,
        status: payload.result.run.status,
      });
      setRuns((previous) => [payload.result!.run, ...previous].slice(0, 50));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const runSandbox = async () => {
    if (!fileId || !sandboxProfileId) return;
    setBusy("sandbox");
    setError("");
    setOutput(null);
    try {
      const response = await fetch("/api/ctf/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: sandboxProfileId, fileId }),
      });
      const payload = (await response.json()) as {
        result?: { output: string; command: string; status: string; durationMs: number };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Sandbox gagal dijalankan.");
      setOutput({
        title: `Sandbox output · ${payload.result.durationMs} ms`,
        command: payload.result.command,
        body: payload.result.output,
        status: payload.result.status,
      });
      const refreshed = await fetch("/api/ctf/tools?force=0");
      if (refreshed.ok) {
        const data = (await refreshed.json()) as { tools?: ToolStatus[]; sandbox?: SandboxStatus };
        if (data.sandbox) setSandbox(data.sandbox);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="INTEGRATED TOOLS"
        title="Tool status & isolated execution"
        description="Status tool dibaca langsung dari sistem. Host runner hanya aktif jika diizinkan; eksekusi dinamis memerlukan Docker sandbox dengan network none, non-root, dan resource limit."
        actions={
          <>
            <button type="button" className="ctf-btn" onClick={refresh} disabled={busy !== null}>
              {busy === "refresh" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh status
            </button>
            <Badge tone={installed > 0 ? "green" : "amber"}>{installed}/{tools.length} terpasang</Badge>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel
            title="Katalog tool"
            subtitle="Status diambil dengan menjalankan flag versi; tidak ada integrasi palsu."
            actions={<input className="ctf-input max-w-[180px]" placeholder="Filter…" value={filter} onChange={(event) => setFilter(event.target.value)} />}
          >
            <div className="space-y-4">
              {grouped.map(([category, list]) => (
                <div key={category}>
                  <div className="ctf-label mb-1.5">{category}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {list.map((tool) => (
                      <div key={tool.name} className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="ctf-mono truncate text-[11px] text-[#d1fae5]">{tool.name}</span>
                          <Badge tone={tool.installed ? "green" : "rose"}>{tool.installed ? "ready" : "missing"}</Badge>
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-[9.5px] text-[var(--ctf-dim)]">{tool.purpose}</div>
                        {tool.version && <div className="ctf-mono mt-0.5 line-clamp-1 text-[9px] text-[var(--ctf-muted)]">{tool.version}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {output && (
            <Panel
              title={output.title}
              subtitle={output.command}
              actions={<Badge tone={output.status === "ok" ? "green" : "rose"}>{output.status}</Badge>}
            >
              <pre className="ctf-code ctf-scroll max-h-[420px] whitespace-pre-wrap break-all">{output.body}</pre>
            </Panel>
          )}

          <Panel title="Riwayat eksekusi" subtitle="Hanya run nyata yang tercatat." noPadding>
            {runs.length ? (
              <div className="divide-y divide-[var(--ctf-line)]">
                {runs.slice(0, 20).map((run) => (
                  <div key={run.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="ctf-mono text-[10.5px] text-[#a7f3d0]">{run.tool} <span className="text-[var(--ctf-dim)]">{run.args.join(" ")}</span></div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] text-[var(--ctf-muted)]">{run.summary}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={run.status === "ok" ? "green" : run.status === "blocked" ? "amber" : "rose"}>{run.status}</Badge>
                      <span className="text-[9px] text-[var(--ctf-dim)]">{formatDateTime(run.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4"><EmptyState title="Belum ada eksekusi" description="Jalankan host tool atau sandbox pada file yang sudah diunggah." /></div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Target file" subtitle={`${files.length} file tersedia`}>
            {files.length ? (
              <div className="space-y-2">
                <Field label="File">
                  <select className="ctf-select" value={fileId} onChange={(event) => setFileId(event.target.value)}>
                    {files.map((file) => (
                      <option key={file.id} value={file.id}>{file.name} ({formatBytes(file.size)})</option>
                    ))}
                  </select>
                </Field>
                {selectedFile && (
                  <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-2.5 text-[10px]">
                    <div className="ctf-mono truncate text-[9px] text-[var(--ctf-dim)]">{selectedFile.sha256}</div>
                    <div className="mt-1 text-[var(--ctf-muted)]">{selectedFile.magic} · {formatBytes(selectedFile.size)}</div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="Tidak ada file" description="Unggah artefak di Workspace terlebih dahulu." />
            )}
          </Panel>

          <Panel
            title="Host runner"
            subtitle={hostToolsEnabled ? "Tool dijalankan di host dengan argumen terkontrol." : "Dinonaktifkan di System Settings."}
            actions={<Badge tone={hostToolsEnabled ? "amber" : "rose"}>{hostToolsEnabled ? "ON" : "OFF"}</Badge>}
          >
            <div className="space-y-2">
              <Field label="Profil">
                <select className="ctf-select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                  {initialProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.label} · {profile.timeoutMs / 1000}s</option>
                  ))}
                </select>
              </Field>
              <button type="button" className="ctf-btn w-full" onClick={runHost} disabled={busy !== null || !fileId}>
                {busy === "host" ? <Loader2 size={13} className="animate-spin" /> : <Terminal size={13} />}
                Jalankan di host
              </button>
              <p className="flex gap-1.5 text-[9.5px] leading-relaxed text-[var(--ctf-dim)]">
                <AlertTriangle size={11} className="mt-0.5 shrink-0 text-[var(--ctf-amber)]" />
                Hanya profil tetap dengan argumen file; tidak ada shell bebas. Output dibatasi dan di-timeout.
              </p>
            </div>
          </Panel>

          <Panel
            title="Docker sandbox"
            subtitle={sandbox.note}
            actions={<Badge tone={sandbox.enabled && sandbox.daemonRunning ? "green" : "amber"}>{sandbox.enabled ? "ON" : "OFF"}</Badge>}
          >
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-[var(--ctf-muted)]">Docker CLI</span><span className={sandbox.dockerInstalled ? "text-[#6ee7b7]" : "text-[#fda4af]"}>{sandbox.dockerInstalled ? "ada" : "tidak ada"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ctf-muted)]">Daemon</span><span className={sandbox.daemonRunning ? "text-[#6ee7b7]" : "text-[#fda4af]"}>{sandbox.daemonRunning ? sandbox.version || "aktif" : "tidak aktif"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ctf-muted)]">Image</span><span className={sandbox.imagePresent ? "text-[#6ee7b7]" : "text-[#fcd34d]"}>{sandbox.imagePresent ? "siap" : "belum ada"}</span></div>
              <div className="ctf-mono break-all text-[9px] text-[var(--ctf-dim)]">{sandbox.image}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {sandbox.limits.map((limit: string) => <Badge key={limit} tone="cyan">{limit}</Badge>)}
            </div>
            <div className="mt-3 space-y-2">
              <Field label="Profil sandbox">
                <select className="ctf-select" value={sandboxProfileId} onChange={(event) => setSandboxProfileId(event.target.value)}>
                  {sandboxProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                </select>
              </Field>
              <button
                type="button"
                className="ctf-btn ctf-btn-primary w-full"
                onClick={runSandbox}
                disabled={busy !== null || !fileId || !sandboxEnabled || !sandbox.imagePresent}
              >
                {busy === "sandbox" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                Jalankan di sandbox
              </button>
              {!sandboxEnabled && <p className="text-[9.5px] text-[var(--ctf-dim)]">Aktifkan sandbox di System Settings setelah Docker dan image tersedia.</p>}
            </div>
          </Panel>

          <Panel title="Kebijakan eksekusi" noPadding>
            <div className={cn("space-y-1.5 p-4 text-[10px] leading-relaxed text-[var(--ctf-muted)]")}>
              <p>• File tidak pernah dieksekusi langsung sebagai program.</p>
              <p>• Sandbox: network none, read-only root, cap-drop ALL, non-root.</p>
              <p>• Batas memori 256 MB, CPU 0.5, PID 64, timeout 30 detik.</p>
              <p>• Container dihapus otomatis (--rm).</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
