import { randomUUID } from "node:crypto";
import { copyFile, link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { challengeWorkspacePaths } from "./picoctf/workspace";
import {
  addToolRun,
  audit,
  getDataDir,
  getSession,
  getSettings,
  listFiles,
  resolveStoredFilePath,
} from "./store";
import { runDocker, runDockerBuffer } from "./sandbox";
import type { StoredFile } from "./types";

/**
 * Interactive Kali Linux terminal backed by a long-lived Docker container.
 *
 * Security model:
 *  - the container is the isolation boundary; nothing runs on the host
 *  - read-only root filesystem, all capabilities dropped, non-root user
 *  - no network unless CTF_TERMINAL_NETWORK=1
 *  - memory/CPU/PID limits and a per-command timeout
 *  - uploaded files are copied into a per-session read-only /analysis mount
 *  - container-escape oriented commands are rejected before execution
 */
export const TERMINAL_IMAGE = process.env.CTF_TERMINAL_IMAGE || "ctf-kali-sandbox:latest";
// Network is enabled by default. Set CTF_TERMINAL_NETWORK=0 to force --network none.
const NETWORK_ENABLED = process.env.CTF_TERMINAL_NETWORK !== "0";
const TTL_MINUTES = Math.max(15, Number(process.env.CTF_TERMINAL_TTL_MINUTES || 180));
const TTL_MS = TTL_MINUTES * 60_000;
const DEFAULT_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(5_000, Number(process.env.CTF_TERMINAL_TIMEOUT_MS || 20_000)),
);
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
const MEMORY_LIMIT = `${envInt("CTF_TERMINAL_MEMORY_MB", 512, 128, 8192)}m`;
const CPU_LIMIT = String(envInt("CTF_TERMINAL_CPUS", 1, 1, 16));
const PIDS_LIMIT = String(envInt("CTF_TERMINAL_PIDS_LIMIT", 128, 16, 2048));
const MAX_OUTPUT = 64_000;
const MAX_FILES = 20;
const MAX_PLAN_COMMANDS = 16;
const MAX_ARTIFACTS = 30;
const DEFAULT_CWD = "/work";
const ALLOWED_CWD_ROOTS = ["/work", "/analysis", "/tmp"];

/** Tools the agent is told about; availability is discovered in the container. */
export const KALI_TOOLS = [
  "file", "strings", "xxd", "hexdump", "grep", "find", "jq", "exiftool",
  "openssl", "python3", "binwalk", "foremost", "pngcheck", "zsteg", "steghide",
  "tshark", "tcpdump", "curl", "7z", "readelf", "objdump", "gdb", "strace",
  "ffprobe", "soxi", "pdfinfo", "pdftotext", "identify", "john", "nmap", "perl", "ruby",
  "checksec", "vol", "r2", "ghidra", "hashcat",
] as const;

export interface TerminalFile {
  id: string;
  name: string;
  target: string;
  size: number;
}

export interface TerminalArtifact {
  path: string;
  size: number;
}

export interface TerminalInfo {
  sessionId: string;
  containerName: string;
  image: string;
  network: boolean;
  files: TerminalFile[];
  tools: string[];
  cwd: string;
  startedAt: string;
}

interface TerminalSession extends TerminalInfo {
  lastUsed: number;
}

export interface TerminalStatus {
  enabled: boolean;
  dockerInstalled: boolean;
  daemonRunning: boolean;
  image: string;
  imagePresent: boolean;
  network: boolean;
  note: string;
  limits: string[];
}

export interface TerminalExecResult {
  commandId: string;
  sessionId: string;
  cwd: string;
  command: string;
  /** stdout and stderr are captured separately, as required by the protocol. */
  stdout: string;
  stderr: string;
  /** stdout + stderr, kept for existing consumers. */
  output: string;
  status: "ok" | "error" | "blocked";
  exitCode: number | null;
  durationMs: number;
  artifacts: TerminalArtifact[];
  processes: string[];
  requestId?: string;
  purpose?: string;
  hypothesisId?: string;
  phase?: string;
}

const sessions = new Map<string, TerminalSession>();
const queues = new Map<string, Promise<unknown>>();
const workingDirectories = new Map<string, string>();
let statusCache: { at: number; status: TerminalStatus } | null = null;
let lastSweep = 0;

function containerNameFor(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9]/g, "").slice(-40) || "adhoc";
  return `ctf-term-${safe}`;
}

function analysisDirFor(sessionId: string, challengeId?: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(-60) || "adhoc";
  if (challengeId) {
    return path.join(/*turbopackIgnore: true*/ challengeWorkspacePaths(challengeId).analysisDir, safe);
  }
  return path.join(path.resolve(getDataDir()), "terminal", safe);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "file";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function cleanOutput(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCwd(value: string): string {
  const cwd = value.trim() || DEFAULT_CWD;
  const allowed = ALLOWED_CWD_ROOTS.some(
    (root) => cwd === root || cwd.startsWith(`${root}/`),
  );
  return allowed && !cwd.includes("..") ? cwd : DEFAULT_CWD;
}

function currentCwd(sessionId: string): string {
  return normalizeCwd(workingDirectories.get(sessionId) || DEFAULT_CWD);
}

/** Phase 1 of the agent workflow: environment, tools, storage and cwd. */
export function buildEnvironmentCommand(): string {
  const probes = KALI_TOOLS.map(
    (tool) =>
      `if command -v ${tool} >/dev/null 2>&1; then echo "TOOL ${tool} yes"; else echo "TOOL ${tool} MISSING"; fi`,
  ).join("; ");
  return [
    "echo '=== KALI ENVIRONMENT ==='",
    "printf 'user='; id -un; printf 'uid='; id -u",
    "printf 'kernel='; uname -sr",
    "printf 'cwd='; pwd",
    "echo '=== STORAGE /work ==='; df -h /work 2>/dev/null | tail -n 2",
    "echo '=== TOOL DISCOVERY ==='",
    probes,
  ].join("; ");
}

async function discoverTools(containerName: string): Promise<string[]> {
  const probe = KALI_TOOLS.map(
    (tool) => `command -v ${tool} >/dev/null 2>&1 && echo ${tool}`,
  ).join("; ");
  const result = await runDocker(["exec", containerName, "sh", "-c", probe], 10_000, 20_000);
  if (!result.ok) return [];
  const found = new Set(result.stdout.split(/\s+/).map((item) => item.trim()).filter(Boolean));
  return KALI_TOOLS.filter((tool) => found.has(tool));
}

export function validateTerminalCommand(command: string): { ok: boolean; reason?: string } {
  const value = command.trim();
  if (!value) return { ok: false, reason: "Perintah kosong." };
  if (value.length > 4000) return { ok: false, reason: "Perintah terlalu panjang (maks 4000 karakter)." };
  if (value.includes("\u0000")) return { ok: false, reason: "Perintah memuat byte NUL." };
  const blocked: Array<[RegExp, string]> = [
    [/\b(?:docker|podman|nerdctl|ctr|runc|crictl|kubectl)\b/i, "Perintah runtime container diblokir di dalam sandbox."],
    [/\b(?:nsenter|unshare|chroot|pivot_root|setns)\b/i, "Perintah namespace/escape diblokir."],
    [/\b(?:mount|umount)\b/i, "Mount diblokir; /analysis dan /work sudah disediakan."],
    [/\/proc\/(?:1|self)\/root/i, "Akses root proses host diblokir."],
    [/\b(?:mkfs|mkswap|fdisk|parted|wipefs)\b/i, "Operasi disk diblokir."],
    [/\b(?:shutdown|reboot|poweroff|halt|init\s+0)\b/i, "Perintah mematikan sistem diblokir."],
    [/\b(?:sudo|su)\b/i, "Escalation user diblokir; container berjalan sebagai non-root."],
    [/\/dev\/(?:sd|nvme|vd|hd)[a-z]/i, "Akses device blok diblokir."],
    [/:\(\)\s*\{.*\};\s*:/, "Fork bomb diblokir."],
  ];
  for (const [pattern, reason] of blocked) {
    if (pattern.test(value)) return { ok: false, reason };
  }
  return { ok: true };
}

export async function getTerminalStatus(force = false): Promise<TerminalStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.status;
  const settings = await getSettings();
  const version = await runDocker(["version", "--format", "{{.Server.Version}}"], 4000, 4000);
  const dockerInstalled = !(version.error && /ENOENT/i.test(version.error));
  const daemonRunning = version.ok && Boolean(version.stdout.trim());
  let imagePresent = false;
  if (daemonRunning) {
    const inspect = await runDocker(
      ["image", "inspect", TERMINAL_IMAGE, "--format", "{{.Id}}"],
      5000,
      4000,
    );
    imagePresent = inspect.ok && Boolean(inspect.stdout.trim());
  }
  const status: TerminalStatus = {
    enabled: settings.system.sandboxEnabled,
    dockerInstalled,
    daemonRunning,
    image: TERMINAL_IMAGE,
    imagePresent,
    network: NETWORK_ENABLED,
    note: !dockerInstalled
      ? "Docker CLI tidak ditemukan. Terminal Kali tidak tersedia."
      : !daemonRunning
        ? "Docker terpasang tetapi daemon tidak merespons. Jalankan Docker Desktop."
        : !imagePresent
          ? `Image ${TERMINAL_IMAGE} belum dibangun. Jalankan: docker build -t ${TERMINAL_IMAGE} docker/ctf-kali`
          : settings.system.sandboxEnabled
            ? `Terminal Kali siap. Container terisolasi, non-root, read-only, jaringan ${NETWORK_ENABLED ? "bridge (aktif)" : "dinonaktifkan"}.`
            : "Docker siap, tetapi sandbox dinonaktifkan di System Settings.",
    limits: [
      `--network ${NETWORK_ENABLED ? "bridge (aktif)" : "none"}`,
      "--read-only",
      "--cap-drop ALL + NET_RAW,NET_ADMIN,NET_BIND_SERVICE (tool jaringan)",
      "--security-opt no-new-privileges",
      "--user 1000:1000",
      `--memory ${MEMORY_LIMIT} --cpus ${CPU_LIMIT} --pids-limit ${PIDS_LIMIT}`,
      `/analysis read-only, /work + /tmp tmpfs`,
      `timeout ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s per perintah`,
    ],
  };
  statusCache = { at: Date.now(), status };
  return status;
}

async function resolveFiles(sessionId: string, fileIds?: string[]): Promise<StoredFile[]> {
  const session = await getSession(sessionId);
  const all = await listFiles();
  if (fileIds?.length) {
    const wanted = new Set(fileIds);
    return all.filter((file) => wanted.has(file.id)).slice(0, MAX_FILES);
  }
  if (session?.challengeId) {
    return all.filter((file) => file.challengeId === session.challengeId).slice(0, MAX_FILES);
  }
  return all.slice(0, MAX_FILES);
}

async function prepareAnalysisDir(
  sessionId: string,
  files: StoredFile[],
  challengeId?: string,
): Promise<TerminalFile[]> {
  const dir = analysisDirFor(sessionId, challengeId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const entries: TerminalFile[] = [];
  for (const [index, file] of files.entries()) {
    let source: string;
    try {
      source = resolveStoredFilePath(file.storageName);
    } catch {
      continue;
    }
    if (!existsSync(source)) continue;
    const name = `${String(index).padStart(2, "0")}_${sanitizeFileName(file.originalName)}`;
    const destination = path.join(dir, name);
    try {
      await link(source, destination);
    } catch {
      await copyFile(source, destination);
    }
    entries.push({
      id: file.id,
      name: file.originalName,
      target: `/analysis/${name}`,
      size: file.size,
    });
  }
  const manifest = [
    "CTF Intelligence — Kali analysis workspace",
    `Session : ${sessionId}`,
    `Created : ${new Date().toISOString()}`,
    `Files   : ${entries.length}`,
    "",
    ...entries.map(
      (entry) => `- ${entry.target}  (${entry.size} bytes)  original=${entry.name}`,
    ),
    "",
    "Gunakan path di atas pada perintah Anda. /analysis bersifat read-only;",
    "tulis hasil kerja ke /work atau /tmp.",
  ].join("\n");
  await writeFile(path.join(dir, "MANIFEST.txt"), manifest, "utf8");
  await writeFile(
    path.join(dir, "MANIFEST.json"),
    JSON.stringify({ sessionId, createdAt: new Date().toISOString(), files: entries }, null, 2),
    "utf8",
  );
  return entries;
}

async function sweepOldContainers(): Promise<void> {
  if (Date.now() - lastSweep < 10 * 60_000) return;
  lastSweep = Date.now();
  try {
    const list = await runDocker(["ps", "-aq", "--filter", "label=ctf.terminal=1"], 8000, 20_000);
    if (!list.ok) return;
    for (const id of list.stdout.split(/\s+/).filter(Boolean)) {
      const inspect = await runDocker(["inspect", "-f", "{{.Created}}", id], 5000, 2000);
      if (!inspect.ok) continue;
      const created = Date.parse(inspect.stdout.trim());
      if (Number.isFinite(created) && Date.now() - created > TTL_MS) {
        await runDocker(["rm", "-f", id], 10_000, 2000);
      }
    }
  } catch {
    // Cleanup is best-effort and must never break a terminal request.
  }
}

export async function startTerminal(sessionId: string, fileIds?: string[]): Promise<TerminalInfo> {
  const settings = await getSettings();
  if (!settings.system.sandboxEnabled) {
    throw new Error(
      "Sandbox dinonaktifkan. Aktifkan di System Settings hanya jika Docker tersedia dan Anda memahami risikonya.",
    );
  }
  const status = await getTerminalStatus(true);
  if (!status.daemonRunning) throw new Error(status.note);
  if (!status.imagePresent) throw new Error(status.note);

  void sweepOldContainers();

  const files = await resolveFiles(sessionId, fileIds);
  const session = await getSession(sessionId);
  const challengeId = session?.challengeId || files.find((file) => file.challengeId)?.challengeId;
  const prepared = await prepareAnalysisDir(sessionId, files, challengeId);
  const containerName = containerNameFor(sessionId);
  await runDocker(["rm", "-f", containerName], 20_000, 4000);

  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "--label",
    "ctf.terminal=1",
    "--label",
    `ctf.session=${sessionId}`,
    "--label",
    `ctf.files=${prepared.map((file) => file.id).join(",")}`,
    "--network",
    NETWORK_ENABLED ? "bridge" : "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    // File-capability binaries such as nmap need these in the bounding set.
    // The container remains isolated: own netns, non-root, read-only rootfs,
    // no host mounts, and no-new-privileges is still enforced.
    "--cap-add",
    "NET_RAW",
    "--cap-add",
    "NET_ADMIN",
    "--cap-add",
    "NET_BIND_SERVICE",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "1000:1000",
    "--memory",
    MEMORY_LIMIT,
    "--memory-swap",
    MEMORY_LIMIT,
    "--cpus",
    CPU_LIMIT,
    "--pids-limit",
    PIDS_LIMIT,
    "--env",
    "HOME=/tmp",
    "--env",
    "TERM=dumb",
    "--workdir",
    "/work",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000",
    "--tmpfs",
    "/work:rw,nosuid,size=128m,uid=1000,gid=1000",
    "--mount",
    `type=bind,source=${analysisDirFor(sessionId, challengeId)},target=/analysis,readonly`,
    TERMINAL_IMAGE,
  ];
  const result = await runDocker(args, 40_000, 4000);
  if (!result.ok) {
    throw new Error(
      `Gagal menjalankan container Kali: ${result.error || result.stderr || result.stdout || "unknown error"}`,
    );
  }
  const inspect = await runDocker(
    ["inspect", "-f", "{{.State.Running}}", containerName],
    8000,
    4000,
  );
  if (!inspect.ok || inspect.stdout.trim() !== "true") {
    throw new Error("Container Kali dibuat tetapi tidak berjalan. Periksa Docker Desktop.");
  }

  const tools = await discoverTools(containerName);
  workingDirectories.set(sessionId, DEFAULT_CWD);
  const info: TerminalSession = {
    sessionId,
    containerName,
    image: TERMINAL_IMAGE,
    network: NETWORK_ENABLED,
    files: prepared,
    tools,
    cwd: DEFAULT_CWD,
    startedAt: new Date().toISOString(),
    lastUsed: Date.now(),
  };
  sessions.set(sessionId, info);
  await audit(
    "terminal.start",
    `${sessionId}: ${prepared.length} file, network=${NETWORK_ENABLED ? "on" : "off"}`,
  );
  return info;
}

export async function getTerminalInfo(sessionId: string): Promise<TerminalInfo | null> {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastUsed = Date.now();
    existing.cwd = currentCwd(sessionId);
    return existing;
  }
  const name = containerNameFor(sessionId);
  const inspect = await runDocker(["inspect", "-f", "{{.State.Running}}", name], 5000, 2000);
  if (!inspect.ok || inspect.stdout.trim() !== "true") return null;
  return {
    sessionId,
    containerName: name,
    image: TERMINAL_IMAGE,
    network: NETWORK_ENABLED,
    files: [],
    tools: [],
    cwd: currentCwd(sessionId),
    startedAt: "",
  };
}

export async function ensureTerminal(
  sessionId: string,
  fileIds?: string[],
): Promise<TerminalInfo> {
  const existing = sessions.get(sessionId);
  if (existing) {
    const wanted = (await resolveFiles(sessionId, fileIds)).map((file) => file.id).join(",");
    const current = existing.files.map((file) => file.id).join(",");
    const inspect = await runDocker(
      ["inspect", "-f", "{{.State.Running}}", existing.containerName],
      5000,
      2000,
    );
    if (inspect.ok && inspect.stdout.trim() === "true" && wanted === current) {
      existing.lastUsed = Date.now();
      return existing;
    }
    await resetTerminal(sessionId);
  }
  return startTerminal(sessionId, fileIds);
}

function enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(sessionId) || Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    sessionId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function parseSentinels(raw: string, fallbackCwd: string): {
  stdout: string;
  cwd: string;
  artifacts: TerminalArtifact[];
  processes: string[];
} {
  let cwd = fallbackCwd;
  let artifacts: TerminalArtifact[] = [];
  let processes: string[] = [];
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("__CTF_PWD__:")) {
      cwd = normalizeCwd(line.slice("__CTF_PWD__:".length));
    } else if (line.startsWith("__CTF_ARTIFACTS__:")) {
      artifacts = line
        .slice("__CTF_ARTIFACTS__:".length)
        .split(";")
        .map((item) => {
          const [file, size] = item.split("|");
          return { path: file || "", size: Math.max(0, Number(size) || 0) };
        })
        .filter((item) => item.path.startsWith("/work/") || item.path.startsWith("/tmp/"))
        .slice(0, MAX_ARTIFACTS);
    } else if (line.startsWith("__CTF_PS__:")) {
      processes = line
        .slice("__CTF_PS__:".length)
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);
    } else {
      kept.push(line);
    }
  }
  return { stdout: kept.join("\n"), cwd, artifacts, processes };
}

export async function execTerminal(input: {
  sessionId: string;
  command: string;
  fileIds?: string[];
  timeoutMs?: number;
  record?: boolean;
  requestId?: string;
  purpose?: string;
  hypothesisId?: string;
  phase?: string;
  challengeId?: string;
}): Promise<TerminalExecResult> {
  const commandId = randomUUID();
  const validation = validateTerminalCommand(input.command);
  if (!validation.ok) {
    if (input.record !== false) {
      await addToolRun({
        sessionId: input.sessionId,
        challengeId: input.challengeId,
        requestId: input.requestId,
        purpose: input.purpose,
        hypothesisId: input.hypothesisId,
        phase: input.phase,
        tool: "kali",
        args: [input.command.slice(0, 300)],
        status: "blocked",
        summary: (validation.reason || "Perintah ditolak.").slice(0, 320),
        durationMs: 0,
      });
    }
    return {
      commandId,
      sessionId: input.sessionId,
      cwd: currentCwd(input.sessionId),
      command: input.command,
      stdout: "",
      stderr: validation.reason || "Perintah ditolak.",
      output: validation.reason || "Perintah ditolak.",
      status: "blocked",
      exitCode: null,
      durationMs: 0,
      artifacts: [],
      processes: [],
      requestId: input.requestId,
      purpose: input.purpose,
      hypothesisId: input.hypothesisId,
      phase: input.phase,
    };
  }
  const info = await ensureTerminal(input.sessionId, input.fileIds);
  const cwd = currentCwd(input.sessionId);
  return enqueue(input.sessionId, async () => {
    const timeoutMs = clamp(input.timeoutMs || DEFAULT_TIMEOUT_MS, 3000, 120_000);
    const seconds = Math.ceil(timeoutMs / 1000);
    const wrapped = [
      `cd ${shellQuote(cwd)} >/dev/null 2>&1 || cd ${DEFAULT_CWD}`,
      input.command,
      "__ctf_code=$?",
      `printf "__CTF_PWD__:%s\\n" "$(pwd)"`,
      `printf "__CTF_ARTIFACTS__:%s\\n" "$(find ${DEFAULT_CWD} -maxdepth 3 -type f 2>/dev/null | head -n ${MAX_ARTIFACTS} | while read -r f; do printf "%s|%s;" "$f" "$(stat -c %s "$f" 2>/dev/null || echo 0)"; done)"`,
      `printf "__CTF_PS__:%s\\n" "$(ps -eo pid=,comm=,etimes= 2>/dev/null | tail -n 6 | tr "\\n" ";")"`,
      "exit $__ctf_code",
    ].join("; ");
    const timed = `timeout -k 2 ${seconds}s sh -c ${shellQuote(wrapped)}`;
    const started = Date.now();
    const result = await runDocker(
      [
        "exec",
        "--env",
        "HOME=/tmp",
        "--workdir",
        DEFAULT_CWD,
        info.containerName,
        "sh",
        "-c",
        timed,
      ],
      timeoutMs + 8000,
      MAX_OUTPUT * 2,
    );
    const parsed = parseSentinels(result.stdout, cwd);
    workingDirectories.set(input.sessionId, parsed.cwd);
    const stdout = cleanOutput(parsed.stdout).slice(0, MAX_OUTPUT);
    const stderr = cleanOutput(result.stderr).slice(0, MAX_OUTPUT);
    const exitCode = result.exitCode ?? (result.ok ? 0 : 1);
    const status: TerminalExecResult["status"] = result.ok ? "ok" : "error";
    const output =
      [stdout, stderr].filter(Boolean).join("\n").slice(0, MAX_OUTPUT) || "(tidak ada output)";
    if (input.record !== false) {
      await addToolRun({
        sessionId: input.sessionId,
        challengeId: input.challengeId,
        requestId: input.requestId,
        purpose: input.purpose,
        hypothesisId: input.hypothesisId,
        phase: input.phase,
        tool: "kali",
        args: [input.command.slice(0, 300)],
        status,
        exitCode,
        artifacts: parsed.artifacts.slice(0, 30),
        summary: `${stdout.split(/\n/).filter(Boolean).slice(0, 2).join(" | ").slice(0, 320) || stderr.slice(0, 320) || "Tidak ada output."} [exit ${exitCode}]`,
        durationMs: Date.now() - started,
      });
    }
    return {
      commandId,
      sessionId: input.sessionId,
      cwd: parsed.cwd,
      command: input.command,
      stdout,
      stderr,
      output,
      status,
      exitCode,
      durationMs: Date.now() - started,
      artifacts: parsed.artifacts,
      processes: parsed.processes,
      requestId: input.requestId,
      purpose: input.purpose,
      hypothesisId: input.hypothesisId,
      phase: input.phase,
    };
  });
}

export async function resetTerminal(sessionId: string): Promise<void> {
  const name = containerNameFor(sessionId);
  await runDocker(["rm", "-f", name], 20_000, 4000);
  const session = await getSession(sessionId);
  sessions.delete(sessionId);
  workingDirectories.delete(sessionId);
  await rm(analysisDirFor(sessionId, session?.challengeId), { recursive: true, force: true });
  await audit("terminal.reset", sessionId);
}

function toolAvailable(name: string): string {
  return `if command -v ${name} >/dev/null 2>&1; then`;
}

export function buildAnalysisPlan(files: TerminalFile[], records: StoredFile[]): string[] {
  const commands: string[] = [
    "pwd; id; uname -a",
    "ls -la /analysis; echo '--- MANIFEST ---'; cat /analysis/MANIFEST.txt",
    `grep -aEro '[A-Za-z0-9_]{2,16}\\{[^}]{1,200}\\}' /analysis 2>/dev/null | head -n 60`,
  ];
  const byId = new Map(records.map((record) => [record.id, record]));
  const add = (command: string) => {
    if (commands.length >= MAX_PLAN_COMMANDS) return;
    if (!commands.includes(command)) commands.push(command);
  };

  for (const file of files) {
    if (commands.length >= MAX_PLAN_COMMANDS) break;
    const record = byId.get(file.id);
    const target = shellQuote(file.target);
    const extension = (record?.extension || "").toLowerCase();
    const mime = record?.mime || "";
    const magic = record?.magic || "";

    add(`file ${target}; sha256sum ${target}`);

    const isImage =
      mime.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"].includes(extension);
    const isAudio =
      mime.startsWith("audio/") || ["wav", "mp3", "flac", "ogg", "m4a", "aac"].includes(extension);
    const isVideo = mime.startsWith("video/") || ["mp4", "mkv", "avi", "mov", "webm"].includes(extension);
    const isPcap = ["pcap", "pcapng", "cap"].includes(extension);
    const isPdf = extension === "pdf" || mime === "application/pdf";
    const isArchive = ["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "tgz"].includes(extension);
    const isExecutable =
      ["elf", "exe", "dll", "so", "bin", "o"].includes(extension) ||
      /ELF|PE32|Mach-O/i.test(magic);

    if (isImage) {
      add(`${toolAvailable("exiftool")} exiftool ${target}; fi`);
      add(`${toolAvailable("identify")} identify -verbose ${target} 2>&1 | head -n 80; fi`);
      add(`${toolAvailable("binwalk")} binwalk ${target} 2>&1 | head -n 100; fi`);
      if (extension === "png") {
        add(`${toolAvailable("pngcheck")} pngcheck -v ${target} 2>&1 | head -n 80; fi`);
        add(`${toolAvailable("zsteg")} zsteg -a ${target} 2>&1 | head -n 120; fi`);
      }
    } else if (isAudio) {
      add(`${toolAvailable("soxi")} soxi ${target} 2>&1; fi`);
      add(`${toolAvailable("exiftool")} exiftool ${target}; fi`);
      add(`strings -n 6 ${target} | head -n 120`);
      add(`${toolAvailable("binwalk")} binwalk ${target} 2>&1 | head -n 100; fi`);
    } else if (isVideo) {
      add(`${toolAvailable("ffprobe")} ffprobe -hide_banner ${target} 2>&1 | head -n 80; fi`);
      add(`strings -n 6 ${target} | head -n 120`);
    } else if (isPcap) {
      add(
        `${toolAvailable("tshark")} tshark -r ${target} -q -z io,phs 2>/dev/null | head -n 100; fi`,
      );
      add(
        `${toolAvailable("tshark")} tshark -r ${target} -Y http.request -T fields -e http.host -e http.request.uri 2>/dev/null | head -n 60; fi`,
      );
      add(`strings -n 6 ${target} | head -n 120`);
    } else if (isPdf) {
      add(`${toolAvailable("pdfinfo")} pdfinfo ${target} 2>&1; fi`);
      add(`${toolAvailable("pdftotext")} pdftotext -layout ${target} - 2>/dev/null | head -n 120; fi`);
      add(`${toolAvailable("exiftool")} exiftool ${target}; fi`);
    } else if (isArchive) {
      add(`${toolAvailable("7z")} 7z l ${target} 2>&1 | head -n 100; fi`);
      add(`file ${target}`);
    } else if (isExecutable) {
      add(`${toolAvailable("readelf")} readelf -h ${target} 2>&1; fi`);
      add(`${toolAvailable("readelf")} readelf -S ${target} 2>/dev/null | head -n 100; fi`);
      add(`strings -n 6 ${target} | head -n 160`);
      add(`${toolAvailable("objdump")} objdump -d ${target} 2>/dev/null | head -n 80; fi`);
    } else {
      add(`${toolAvailable("binwalk")} binwalk ${target} 2>&1 | head -n 100; fi`);
      add(`strings -n 6 ${target} | head -n 160`);
      add(`head -c 4000 ${target} 2>/dev/null`);
    }
  }
  return commands.slice(0, MAX_PLAN_COMMANDS);
}

export interface TerminalPlanResult {
  info: TerminalInfo;
  steps: TerminalExecResult[];
}

export async function runTerminalPlan(input: {
  sessionId: string;
  fileIds?: string[];
  commands?: string[];
  timeoutMs?: number;
}): Promise<TerminalPlanResult> {
  const info = await ensureTerminal(input.sessionId, input.fileIds);
  const records = await resolveFiles(input.sessionId, input.fileIds);
  const baseline = [
    "pwd; id; uname -a",
    "ls -la /analysis; echo '--- MANIFEST ---'; cat /analysis/MANIFEST.txt",
  ];
  const requested = (input.commands || [])
    .map((command) => command.trim())
    .filter((command) => command && validateTerminalCommand(command).ok)
    .slice(0, 8);
  const plan = requested.length
    ? [...baseline, ...requested.filter((command) => !baseline.includes(command))]
    : buildAnalysisPlan(info.files, records);

  const steps: TerminalExecResult[] = [];
  for (const command of plan.slice(0, MAX_PLAN_COMMANDS)) {
    steps.push(
      await execTerminal({
        sessionId: input.sessionId,
        command,
        fileIds: input.fileIds,
        timeoutMs: input.timeoutMs || 15_000,
      }),
    );
  }
  return { info, steps };
}

export async function readTerminalManifest(sessionId: string): Promise<string | null> {
  try {
    const session = await getSession(sessionId);
    return await readFile(
      path.join(analysisDirFor(sessionId, session?.challengeId), "MANIFEST.txt"),
      "utf8",
    );
  } catch {
    return null;
  }
}

/** Reads a generated artifact out of the container with binary-safe output. */
export async function readTerminalArtifact(
  sessionId: string,
  requestedPath: string,
): Promise<{ name: string; data: Buffer; mime: string }> {
  const value = requestedPath.trim();
  if (!(value.startsWith("/work/") || value.startsWith("/tmp/"))) {
    throw new Error("Hanya file di /work atau /tmp yang bisa diunduh.");
  }
  if (value.includes("..") || /[\r\n\u0000]/.test(value)) {
    throw new Error("Path artifact tidak valid.");
  }
  const container = sessions.get(sessionId)?.containerName || containerNameFor(sessionId);
  const inspect = await runDocker(["inspect", "-f", "{{.State.Running}}", container], 5000, 2000);
  if (!inspect.ok || inspect.stdout.trim() !== "true") {
    throw new Error("Container terminal tidak berjalan.");
  }
  const result = await runDockerBuffer(["exec", container, "cat", value], 20_000);
  if (!result.ok) {
    throw new Error(result.stderr.trim() || "Gagal membaca artifact dari container.");
  }
  if (result.stdout.length > 20_000_000) {
    throw new Error("Artifact terlalu besar untuk diunduh (maks 20 MB).");
  }
  const name = sanitizeFileName(path.posix.basename(value));
  const extension = path.posix.extname(name).toLowerCase();
  const textExtensions = new Set([
    ".txt", ".log", ".json", ".md", ".csv", ".xml", ".html", ".js", ".py", ".sh", ".c", ".cpp", ".h",
  ]);
  return {
    name,
    data: result.stdout,
    mime: textExtensions.has(extension) ? "text/plain; charset=utf-8" : "application/octet-stream",
  };
}
