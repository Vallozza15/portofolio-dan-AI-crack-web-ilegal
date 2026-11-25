"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Send, Terminal } from "lucide-react";
import { Badge, ErrorBanner, Panel } from "./ui";

interface Line {
  id: number;
  kind: "note" | "command" | "stdout" | "stderr" | "result";
  text: string;
}

/** WebSocket terminal: live streaming output and stdin for interactive programs. */
export function WsTerminal({
  sessionId,
  fileIds,
  onEnsureSession,
}: {
  sessionId?: string;
  fileIds: string[];
  onEnsureSession: (text: string) => Promise<{ id: string } | null>;
}) {
  const [activeId, setActiveId] = useState(sessionId || "");
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [command, setCommand] = useState("");
  const [stdin, setStdin] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const counter = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const append = (kind: Line["kind"], text: string) => {
    counter.current += 1;
    setLines((previous) => [...previous.slice(-299), { id: counter.current, kind, text }]);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  useEffect(() => {
    if (!activeId) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ctf/terminal/ws?sessionId=${encodeURIComponent(activeId)}`);
    wsRef.current = socket;
    socket.onopen = () => {
      setConnected(true);
      setError("");
      append("note", `WebSocket terhubung (sesi ${activeId}). Menyiapkan container Kali…`);
      socket.send(JSON.stringify({ type: "start", fileIds }));
    };
    socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(message.type || "");
      if (type === "session") {
        append("note", `Container siap. Tool terdeteksi: ${((message.session as { tools?: string[] })?.tools || []).length}.`);
      } else if (type === "started") {
        setRunning(true);
        append("command", String(message.command || ""));
      } else if (type === "chunk") {
        const text = String(message.text || "");
        if (!/__CTF_(PWD|ARTIFACTS)__:/.test(text)) {
          append(message.stream === "stderr" ? "stderr" : "stdout", text);
        }
      } else if (type === "result") {
        setRunning(false);
        append(
          "result",
          `exit ${message.exitCode ?? "—"} · ${message.durationMs ?? 0} ms · ${String(message.status || "")}`,
        );
      } else if (type === "error") {
        setError(String(message.message || "Kesalahan WebSocket."));
        setRunning(false);
      }
    };
    socket.onerror = () => setError("Koneksi WebSocket gagal. Pastikan server dijalankan dengan `npm start` (custom server).");
    socket.onclose = () => {
      setConnected(false);
      setRunning(false);
      append("note", "WebSocket ditutup.");
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ensure = async (): Promise<string> => {
    if (activeId) return activeId;
    const created = await onEnsureSession("WebSocket Kali Terminal");
    if (!created?.id) throw new Error("Tidak bisa membuat sesi.");
    setActiveId(created.id);
    return created.id;
  };

  const exec = async () => {
    const value = command.trim();
    if (!value || !connected || running) return;
    await ensure();
    setCommand("");
    wsRef.current?.send(JSON.stringify({ type: "exec", command: value, timeoutMs: 120_000 }));
  };

  const writeStdin = () => {
    if (!stdin || !running) return;
    wsRef.current?.send(JSON.stringify({ type: "stdin", data: stdin.endsWith("\n") ? stdin : `${stdin}\n` }));
    setStdin("");
  };

  return (
    <Panel
      title={<div className="flex items-center gap-2"><Radio size={15} className="text-[var(--ctf-cyan)]" /><span>Kali Terminal — WebSocket interaktif</span></div>}
      subtitle="Output streaming langsung dan stdin untuk program interaktif (mis. nc). Masih berjalan di container yang sama dan tervalidasi."
      actions={<Badge tone={connected ? "green" : "rose"}>{connected ? "terhubung" : "terputus"}</Badge>}
    >
      {error && <div className="mb-2"><ErrorBanner message={error} /></div>}
      <div className="ctf-scroll h-[220px] overflow-y-auto rounded-lg bg-[#02080d] px-3 py-2 font-mono text-[10.5px] leading-relaxed">
        {!lines.length && <p className="text-[#4b6b62]">Buat atau pilih sesi untuk membuka terminal streaming.</p>}
        {lines.map((line) => (
          <pre
            key={line.id}
            className={`whitespace-pre-wrap break-words ${
              line.kind === "command" ? "text-[#7df9c1]"
                : line.kind === "stderr" ? "text-[#fca5a5]"
                  : line.kind === "note" || line.kind === "result" ? "text-[#fbbf24]"
                    : "text-[#c7d2d0]"
            }`}
          >
            {line.kind === "command" ? `$ ${line.text}` : line.text}
          </pre>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--ctf-line)] px-2 py-1.5 font-mono text-[11px]">
        <Terminal size={12} className="text-[var(--ctf-cyan)]" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--ctf-dim)]"
          placeholder={connected ? "perintah Kali…" : "WebSocket belum terhubung"}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void exec();
            }
          }}
          disabled={!connected || running}
        />
        <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-primary" onClick={() => void exec()} disabled={!connected || running || !command.trim()}>
          <Send size={11} /> Kirim
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-[rgba(251,191,36,0.22)] px-2 py-1.5 font-mono text-[11px]">
        <span className="shrink-0 text-[#fbbf24]">stdin{">"}</span>
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--ctf-dim)]"
          placeholder={running ? "input untuk program yang berjalan (nc, dll.)" : "tidak ada proses aktif"}
          value={stdin}
          onChange={(event) => setStdin(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              writeStdin();
            }
          }}
          disabled={!running}
        />
        <button type="button" className="ctf-btn ctf-btn-sm" onClick={writeStdin} disabled={!running || !stdin}>
          Kirim stdin
        </button>
      </div>
    </Panel>
  );
}
