import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { isAuthEnabled, tokenFromCookieHeader, verifySessionToken } from "./session-token";
import { addToolRun, audit } from "./store";
import { ensureTerminal, resetTerminal, validateTerminalCommand } from "./terminal";

const MAX_OUTPUT = 64_000;
const MIN_TIMEOUT = 3_000;
const MAX_TIMEOUT = 120_000;

interface ActiveStream {
  id: string;
  sessionId: string;
  command: string;
  startedAt: number;
  child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
}

const active = new Map<string, ActiveStream>();

export function authorizeTerminalUpgrade(request: IncomingMessage): boolean {
  if (!isAuthEnabled()) return true;
  return verifySessionToken(tokenFromCookieHeader(request.headers.cookie));
}

function cleanSessionId(value: unknown): string {
  const id = String(value || "").trim();
  if (!id || id.length > 120 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("sessionId tidak valid.");
  }
  return id;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripSentinels(raw: string): { stdout: string; cwd: string; artifacts: Array<{ path: string; size: number }> } {
  let cwd = "/work";
  let artifacts: Array<{ path: string; size: number }> = [];
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("__CTF_PWD__:")) {
      const value = line.slice("__CTF_PWD__:".length).trim();
      if (value.startsWith("/work") || value.startsWith("/analysis") || value.startsWith("/tmp")) cwd = value;
    } else if (line.startsWith("__CTF_ARTIFACTS__:")) {
      artifacts = line
        .slice("__CTF_ARTIFACTS__:".length)
        .split(";")
        .map((item) => {
          const [path, size] = item.split("|");
          return { path: path || "", size: Math.max(0, Number(size) || 0) };
        })
        .filter((item) => item.path.startsWith("/work/") || item.path.startsWith("/tmp/"))
        .slice(0, 30);
    } else {
      kept.push(line);
    }
  }
  return { stdout: kept.join("\n"), cwd, artifacts };
}

function send(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

/** Attaches one authenticated WebSocket to the shared Docker-backed terminal. */
export async function attachTerminalSocket(ws: WebSocket, request: IncomingMessage): Promise<void> {
  let sessionId = "";
  try {
    const parsed = new URL(request.url || "/", "http://localhost");
    sessionId = cleanSessionId(parsed.searchParams.get("sessionId"));
  } catch (error) {
    send(ws, { type: "error", message: error instanceof Error ? error.message : String(error) });
    ws.close(4400, "bad session");
    return;
  }
  void audit("terminal.ws.connect", sessionId);
  send(ws, { type: "ready", sessionId, interactive: true });

  const killActive = () => {
    const current = active.get(sessionId);
    if (current) {
      current.child.kill("SIGTERM");
      active.delete(sessionId);
    }
  };

  ws.on("message", (raw) => {
    void (async () => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        send(ws, { type: "error", message: "Pesan WebSocket bukan JSON." });
        return;
      }
      const type = String(message.type || "");
      try {
        if (type === "ping") {
          send(ws, { type: "pong", at: new Date().toISOString() });
          return;
        }
        if (type === "start") {
          const info = await ensureTerminal(sessionId, Array.isArray(message.fileIds)
            ? message.fileIds.map((item) => String(item)).slice(0, 20)
            : []);
          send(ws, { type: "session", session: info });
          return;
        }
        if (type === "reset") {
          killActive();
          await resetTerminal(sessionId);
          send(ws, { type: "reset", sessionId });
          return;
        }
        if (type === "stdin") {
          const current = active.get(sessionId);
          const text = String(message.data ?? "");
          if (!current) {
            send(ws, { type: "error", message: "Tidak ada perintah aktif yang menerima stdin." });
          } else if (text.length > 8000 || text.includes("\u0000")) {
            send(ws, { type: "error", message: "Input stdin ditolak (terlalu panjang atau memuat NUL)." });
          } else {
            current.child.stdin.write(text);
          }
          return;
        }
        if (type !== "exec") {
          send(ws, { type: "error", message: `Tipe pesan ${type} tidak dikenali.` });
          return;
        }
        if (active.has(sessionId)) {
          send(ws, { type: "error", message: "Masih ada perintah aktif. Kirim tipe 'stdin' atau tunggu selesai." });
          return;
        }
        const command = String(message.command || "").trim();
        const validation = validateTerminalCommand(command);
        if (!validation.ok) {
          await addToolRun({
            sessionId,
            tool: "kali-ws",
            args: [command.slice(0, 300)],
            status: "blocked",
            summary: (validation.reason || "Perintah ditolak.").slice(0, 320),
            durationMs: 0,
          });
          send(ws, { type: "result", status: "blocked", command, stdout: "", stderr: validation.reason || "Perintah ditolak.", exitCode: null });
          return;
        }
        const info = await ensureTerminal(sessionId);
        const timeoutMs = Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, Number(message.timeoutMs) || 120_000));
        const seconds = Math.ceil(timeoutMs / 1000);
        const wrapped = [
          "cd /work >/dev/null 2>&1 || cd /tmp",
          command,
          "__ctf_code=$?",
          `printf "__CTF_PWD__:%s\\n" "$(pwd)"`,
          `printf "__CTF_ARTIFACTS__:%s\\n" "$(find /work -maxdepth 3 -type f 2>/dev/null | head -n 30 | while read -r f; do printf "%s|%s;" "$f" "$(stat -c %s "$f" 2>/dev/null || echo 0)"; done)"`,
          "exit $__ctf_code",
        ].join("; ");
        const timed = `timeout -k 2 ${seconds}s sh -c ${shellQuote(wrapped)}`;
        const child = spawn(
          "docker",
          ["exec", "-i", "-e", "HOME=/tmp", "-w", "/work", info.containerName, "sh", "-c", timed],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
        const stream: ActiveStream = {
          id: randomUUID(),
          sessionId,
          command,
          startedAt: Date.now(),
          child,
          stdout: "",
          stderr: "",
        };
        active.set(sessionId, stream);
        send(ws, { type: "started", commandId: stream.id, command, cwd: info.cwd });
        child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stream.stdout = (stream.stdout + text).slice(-MAX_OUTPUT * 2);
          send(ws, { type: "chunk", stream: "stdout", text });
        });
        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stream.stderr = (stream.stderr + text).slice(-MAX_OUTPUT * 2);
          send(ws, { type: "chunk", stream: "stderr", text });
        });
        child.on("error", (error) => {
          active.delete(sessionId);
          send(ws, { type: "result", commandId: stream.id, status: "error", command, stdout: stream.stdout.slice(-MAX_OUTPUT), stderr: error.message, exitCode: null });
        });
        child.on("close", (code) => {
          active.delete(sessionId);
          const parsed = stripSentinels(stream.stdout);
          const stdout = parsed.stdout.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u0000/g, "").trim().slice(0, MAX_OUTPUT);
          const stderr = stream.stderr.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u0000/g, "").trim().slice(0, MAX_OUTPUT);
          const durationMs = Date.now() - stream.startedAt;
          void addToolRun({
            sessionId,
            tool: "kali-ws",
            args: [command.slice(0, 300)],
            status: code === 0 ? "ok" : "error",
            exitCode: code,
            summary: stdout.split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 320) || stderr.slice(0, 320) || "Tanpa output.",
            durationMs,
            artifacts: parsed.artifacts,
          });
          send(ws, {
            type: "result",
            commandId: stream.id,
            status: code === 0 ? "ok" : "error",
            command,
            stdout,
            stderr,
            cwd: parsed.cwd,
            exitCode: code,
            durationMs,
            artifacts: parsed.artifacts,
          });
        });
      } catch (error) {
        send(ws, { type: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  ws.on("close", () => {
    killActive();
    void audit("terminal.ws.close", sessionId);
  });
  ws.on("error", () => {
    killActive();
  });
}
