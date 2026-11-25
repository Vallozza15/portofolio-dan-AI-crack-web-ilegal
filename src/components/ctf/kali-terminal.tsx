"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Cpu,
  FolderOpen,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge, ErrorBanner, Panel } from "./ui";
import type { TerminalInfo, TerminalStatus } from "@/lib/ctf/terminal";

interface HistoryEntry {
  id: string;
  kind: "command" | "output" | "note";
  text: string;
  status?: "ok" | "error" | "blocked";
  durationMs?: number;
  exitCode?: number | null;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  artifacts?: Array<{ path: string; size: number }>;
  processes?: string[];
}

const QUICK_COMMANDS = [
  "ls -la /analysis",
  "file /analysis/*",
  "cat /analysis/MANIFEST.txt",
  "strings -n 6 /analysis/* | head -n 120",
  "binwalk /analysis/*",
  "exiftool /analysis/*",
  "tshark -r /analysis/*.pcap -q -z io,phs",
  "python3 --version",
  "for t in file strings xxd python3 binwalk exiftool zsteg tshark; do command -v $t >/dev/null 2>&1 && echo \"$t yes\" || echo \"$t MISSING\"; done; df -h /work",
];

function entryId() {
  return `term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function KaliTerminal({
  sessionId,
  fileIds,
  onEnsureSession,
}: {
  sessionId?: string;
  fileIds: string[];
  onEnsureSession: (text: string) => Promise<{ id: string } | null>;
}) {
  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const [info, setInfo] = useState<TerminalInfo | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeSessionId = createdSessionId || sessionId || "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [history, busy]);

  const append = (entry: Omit<HistoryEntry, "id">) => {
    setHistory((previous) => [...previous.slice(-199), { ...entry, id: entryId() }]);
  };

  const refreshStatus = async () => {
    try {
      const query = activeSessionId ? `?sessionId=${encodeURIComponent(activeSessionId)}` : "";
      const response = await fetch(`/api/ctf/terminal${query}`);
      const payload = (await response.json()) as {
        terminal?: TerminalStatus;
        session?: TerminalInfo | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Gagal memuat status terminal.");
      if (payload.terminal) setStatus(payload.terminal);
      if (payload.session) setInfo(payload.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const query = activeSessionId
          ? `?sessionId=${encodeURIComponent(activeSessionId)}`
          : "";
        const response = await fetch(`/api/ctf/terminal${query}`);
        const payload = (await response.json()) as {
          terminal?: TerminalStatus;
          session?: TerminalInfo | null;
          history?: Array<{
            id: string;
            command: string;
            status: "ok" | "error" | "blocked" | "skipped";
            summary: string;
            durationMs: number;
            createdAt: string;
          }>;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Gagal memuat status terminal.");
        if (payload.terminal) setStatus(payload.terminal);
        if (payload.session) setInfo(payload.session);
        if (payload.history?.length) {
          setHistory((previous) =>
            previous.length
              ? previous
              : payload.history!.map((item) => ({
                  id: item.id,
                  kind: "output" as const,
                  text: item.summary,
                  status: item.status === "skipped" ? "blocked" : item.status,
                  durationMs: item.durationMs,
                })),
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const ensureSessionId = async (): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    const created = await onEnsureSession("Terminal Kali");
    if (!created?.id) throw new Error("Tidak bisa membuat sesi terminal.");
    setCreatedSessionId(created.id);
    return created.id;
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await ensureSessionId();
      append({ kind: "note", text: "Memulai container Kali (read-only, non-root, network none)…" });
      const response = await fetch("/api/ctf/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", sessionId: id, fileIds }),
      });
      const payload = (await response.json()) as {
        terminal?: TerminalStatus;
        session?: TerminalInfo;
        error?: string;
      };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error || `Gagal memulai terminal (HTTP ${response.status}).`);
      }
      if (payload.terminal) setStatus(payload.terminal);
      setInfo(payload.session);
      append({
        kind: "note",
        text: `Container ${payload.session.containerName} siap. ${payload.session.files.length} file di /analysis. Jaringan: ${payload.session.network ? "bridge" : "none"}.`,
      });
      inputRef.current?.focus();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      append({ kind: "note", text: `Gagal: ${message}` });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    const value = command.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setCommand("");
    append({ kind: "command", text: value });
    try {
      const id = await ensureSessionId();
      const response = await fetch("/api/ctf/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exec", sessionId: id, command: value, fileIds }),
      });
      const payload = (await response.json()) as {
        session?: TerminalInfo;
        result?: {
          commandId: string;
          cwd: string;
          command: string;
          stdout: string;
          stderr: string;
          output: string;
          status: "ok" | "error" | "blocked";
          exitCode: number | null;
          durationMs: number;
          artifacts: Array<{ path: string; size: number }>;
          processes: string[];
        };
        error?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || `Eksekusi gagal (HTTP ${response.status}).`);
      }
      if (payload.session) setInfo(payload.session);
      append({
        kind: "output",
        text: payload.result.output,
        status: payload.result.status,
        durationMs: payload.result.durationMs,
        exitCode: payload.result.exitCode,
        cwd: payload.result.cwd,
        stdout: payload.result.stdout,
        stderr: payload.result.stderr,
        artifacts: payload.result.artifacts,
        processes: payload.result.processes,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      append({ kind: "note", text: `Error: ${message}` });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const id = activeSessionId || sessionId;
      if (id) {
        await fetch(`/api/ctf/terminal?sessionId=${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      setInfo(null);
      setHistory([]);
      await refreshStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(status?.enabled && status?.daemonRunning && status?.imagePresent);
  const running = Boolean(info);

  return (
    <Panel
      noPadding
      title={
        <div className="flex flex-wrap items-center gap-2">
          <Terminal size={15} className="text-[var(--ctf-green)]" />
          <span>Kali Linux Terminal</span>
          <Badge tone={running ? "green" : undefined}>{running ? "container aktif" : "belum aktif"}</Badge>
        </div>
      }
      subtitle="Terminal nyata di dalam container Docker. AI dapat merencanakan perintah, menjalankannya, lalu menganalisis output asli."
      actions={
        <>
          <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-primary" onClick={start} disabled={busy || !ready}>
            {busy && !running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? "Container siap" : "Mulai"}
          </button>
          <button type="button" className="ctf-btn ctf-btn-sm" onClick={reset} disabled={busy || !running}>
            <RotateCcw size={12} /> Reset
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ctf-line)] px-3 py-2 text-[9.5px]">
        <Badge tone={ready ? "green" : "rose"}>
          <Cpu size={10} /> {status?.image || "ctf-kali-sandbox"}
        </Badge>
        <Badge tone={status?.network ? "amber" : "cyan"}>
          {status?.network ? <Wifi size={10} /> : <WifiOff size={10} />}
          {status?.network ? "network bridge" : "network none"}
        </Badge>
        <Badge tone="violet">
          <FolderOpen size={10} /> {info?.files.length ?? 0} file /analysis
        </Badge>
        <Badge tone="cyan">/{info?.tools.length ?? 0} tool Kali terdeteksi</Badge>
        <Badge tone={undefined}>cwd {info?.cwd || "/work"}</Badge>
        <span className="inline-flex items-center gap-1 text-[var(--ctf-dim)]">
          <ShieldAlert size={10} /> eksekusi hanya di container, bukan host
        </span>
        {status?.note && !ready && (
          <span className="text-[var(--ctf-amber)]">{status.note}</span>
        )}
      </div>

      <div className="ctf-scroll h-[300px] overflow-y-auto bg-[#02080d] px-3 py-2 font-mono text-[10.5px] leading-relaxed">
        {!history.length && (
          <div className="space-y-1 text-[#4b6b62]">
            <p className="text-[#7df9c1]">CTF Intelligence — Kali Linux sandbox</p>
            <p>Container: read-only rootfs · non-root · cap-drop ALL · no-new-privileges</p>
            <p>Tekan &quot;Mulai&quot; untuk membuat container, lalu jalankan perintah.</p>
            <p className="text-[#fbbf24]">
              Peringatan: jangan unggah malware nyata. Sandbox ini untuk latihan CTF yang sah.
            </p>
          </div>
        )}
        {history.map((entry) => (
          <div key={entry.id} className="mb-1.5">
            {entry.kind === "command" && (
              <div className="flex items-start gap-1.5 text-[#7df9c1]">
                <ChevronRight size={11} className="mt-0.5 shrink-0" />
                <span className="break-all">{entry.text}</span>
              </div>
            )}
            {entry.kind === "note" && (
              <div className="text-[#fbbf24]">[info] {entry.text}</div>
            )}
            {entry.kind === "output" && (
              <div className="pl-3">
                {entry.stdout && (
                  <pre className="whitespace-pre-wrap break-words text-[#c7d2d0]">{entry.stdout}</pre>
                )}
                {entry.stderr && (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-[#fca5a5]">
                    [stderr] {entry.stderr}
                  </pre>
                )}
                {!entry.stdout && !entry.stderr && (
                  <pre className="whitespace-pre-wrap break-words text-[#c7d2d0]">{entry.text}</pre>
                )}
                {Boolean(entry.artifacts?.length) && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {entry.artifacts!.map((artifact) => (
                      <a
                        key={artifact.path}
                        className="rounded border border-[rgba(52,211,153,0.3)] px-1.5 py-0.5 text-[9px] text-[#7df9c1] hover:bg-[rgba(52,211,153,0.1)]"
                        href={`/api/ctf/terminal/download?sessionId=${encodeURIComponent(activeSessionId)}&path=${encodeURIComponent(artifact.path)}`}
                        download={artifact.path.split("/").pop()}
                      >
                        ↓ {artifact.path} ({artifact.size} B)
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-0.5 text-[8.5px] text-[#3f5a53]">
                  {entry.status} · exit {entry.exitCode ?? "—"} · {entry.durationMs ?? 0} ms · cwd{" "}
                  {entry.cwd || info?.cwd || "/work"}
                  {entry.processes?.length ? ` · ${entry.processes.length} proses terpantau` : ""}
                </div>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5 text-[#7df9c1]">
            <Loader2 size={11} className="animate-spin" /> mengeksekusi…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--ctf-line)] p-2.5">
        {error && <div className="mb-2"><ErrorBanner message={error} /></div>}
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(52,211,153,0.18)] bg-[rgba(2,8,13,0.9)] px-2 py-1.5 font-mono text-[11px]">
          <span className="shrink-0 text-[#34d399]">analyst@kali:{info?.cwd || "/work"}$</span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-[#d1fae5] outline-none placeholder:text-[#3f5a53]"
            placeholder={running ? "file /analysis/*" : "mulai container dulu…"}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void run();
              }
            }}
            disabled={busy || !running}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="ctf-btn ctf-btn-sm ctf-btn-primary"
            onClick={() => void run()}
            disabled={busy || !running || !command.trim()}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            Run
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.5)] px-2 py-1 font-mono text-[9px] text-[var(--ctf-muted)] transition hover:border-[rgba(52,211,153,0.4)] hover:text-[#d1fae5]"
              onClick={() => {
                setCommand(item);
                inputRef.current?.focus();
              }}
              disabled={!running}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
