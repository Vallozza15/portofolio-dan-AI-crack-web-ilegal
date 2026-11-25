import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { addToolRun, audit, getFileRecord, getSettings, getUploadDir } from "./store";

const DEFAULT_IMAGE = process.env.CTF_SANDBOX_IMAGE || "ctf-intelligence-sandbox:latest";

export interface DockerResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
}

export function runDocker(args: string[], timeoutMs = 5000, maxOutput = 300_000): Promise<DockerResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;
    try {
      child = spawn("docker", args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({
        ok: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      });
      return;
    }
    const finish = (result: Omit<DockerResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, stdout, stderr, error: `Timeout setelah ${timeoutMs} ms.` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, stdout, stderr, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, stdout, stderr, exitCode: code ?? undefined });
    });
  });
}

/**
 * Writes secret text into a container through stdin. The secret never appears
 * in argv, shell history, tool-run args, or logs.
 */
export function runDockerWithInput(
  args: string[],
  input: string,
  timeoutMs = 8000,
): Promise<DockerResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;
    try {
      child = spawn("docker", args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve({
        ok: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      });
      return;
    }
    const finish = (result: Omit<DockerResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, stdout, stderr, error: `Timeout setelah ${timeoutMs} ms.` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 4000) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString("utf8");
    });
    child.stdin?.on("error", () => {
      // The child may close stdin early; close handling below decides status.
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, stdout, stderr, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, stdout, stderr, exitCode: code ?? undefined });
    });
    child.stdin?.end(input);
  });
}

/**
 * Binary-safe variant used to download generated artifacts from a terminal
 * container. The text-oriented runDocker() would corrupt non-UTF8 output.
 */
export function runDockerBuffer(args: string[], timeoutMs = 15_000): Promise<{
  ok: boolean;
  stdout: Buffer;
  stderr: string;
  exitCode?: number;
}> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let err = "";
    let settled = false;
    let child;
    try {
      child = spawn("docker", args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ ok: false, stdout: Buffer.alloc(0), stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    const finish = (result: { ok: boolean; stderr: string; exitCode?: number }) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, stdout: Buffer.concat(chunks) });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, stderr: `Timeout setelah ${timeoutMs} ms.` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      if (err.length < 16_000) err += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, stderr: err, exitCode: code ?? undefined });
    });
  });
}

export interface SandboxStatus {
  enabled: boolean;
  dockerInstalled: boolean;
  daemonRunning: boolean;
  image: string;
  imagePresent: boolean;
  version?: string;
  note: string;
  limits: string[];
}

let cache: { at: number; status: SandboxStatus } | null = null;

export async function getSandboxStatus(force = false): Promise<SandboxStatus> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.status;
  const settings = await getSettings();
  const version = await runDocker(["version", "--format", "{{.Server.Version}}"], 4000, 4000);
  const dockerInstalled = !(version.error && /ENOENT/i.test(version.error));
  const daemonRunning = version.ok && Boolean(version.stdout.trim());
  let imagePresent = false;
  if (daemonRunning) {
    const inspect = await runDocker(["image", "inspect", DEFAULT_IMAGE, "--format", "{{.Id}}"], 5000, 4000);
    imagePresent = inspect.ok && Boolean(inspect.stdout.trim());
  }
  const status: SandboxStatus = {
    enabled: settings.system.sandboxEnabled,
    dockerInstalled,
    daemonRunning,
    image: DEFAULT_IMAGE,
    imagePresent,
    version: version.ok ? version.stdout.trim() : undefined,
    note: !dockerInstalled
      ? "Docker CLI tidak ditemukan. Sandbox dinamis tidak tersedia; analisis statis tetap berjalan."
      : !daemonRunning
        ? "Docker terpasang tetapi daemon tidak merespons. Jalankan Docker Desktop/daemon."
        : !imagePresent
          ? `Image ${DEFAULT_IMAGE} belum dibangun. Jalankan docker build -t ${DEFAULT_IMAGE} docker/ctf-sandbox.`
          : settings.system.sandboxEnabled
            ? "Sandbox siap. Eksekusi dibatasi network none, non-root, read-only, dan resource limit."
            : "Docker siap, tetapi sandbox dinonaktifkan di System Settings.",
    limits: [
      "--network none",
      "--read-only",
      "--cap-drop ALL",
      "--security-opt no-new-privileges",
      "--user 65534:65534",
      "--memory 256m --cpus 0.5 --pids-limit 64",
      "timeout 30s + auto-remove",
    ],
  };
  cache = { at: Date.now(), status };
  return status;
}

interface SandboxProfile {
  id: string;
  label: string;
  script: string;
}

const PROFILES: SandboxProfile[] = [
  { id: "identify", label: "file /analysis/input", script: "file /analysis/input" },
  {
    id: "strings",
    label: "strings -n 4 (200 baris)",
    script: "strings -n 4 /analysis/input | head -n 200",
  },
  {
    id: "hashes",
    label: "sha256sum + md5sum",
    script: "sha256sum /analysis/input; md5sum /analysis/input",
  },
  {
    id: "hex",
    label: "od -tx1 (512 byte)",
    script: "od -An -tx1 -N 512 /analysis/input",
  },
];

export function listSandboxProfiles() {
  return PROFILES.map((profile) => ({ id: profile.id, label: profile.label }));
}

export interface SandboxRunResult {
  output: string;
  command: string;
  durationMs: number;
  status: "ok" | "error";
}

export async function runSandboxProfile(profileId: string, fileId: string): Promise<SandboxRunResult> {
  const settings = await getSettings();
  if (!settings.system.sandboxEnabled) {
    throw new Error("Sandbox dinonaktifkan. Aktifkan di System Settings hanya jika Docker tersedia dan Anda memahami risikonya.");
  }
  const profile = PROFILES.find((item) => item.id === profileId);
  if (!profile) throw new Error("Profil sandbox tidak dikenal.");
  const sandbox = await getSandboxStatus(true);
  if (!sandbox.daemonRunning) throw new Error(sandbox.note);
  if (!sandbox.imagePresent) throw new Error(sandbox.note);

  const file = await getFileRecord(fileId);
  if (!file) throw new Error("File tidak ditemukan.");
  const uploadDir = path.resolve(getUploadDir());
  const filePath = path.resolve(uploadDir, file.storageName);
  if (!filePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw new Error("Path file berada di luar direktori upload.");
  }
  if (!existsSync(filePath)) throw new Error("File fisik tidak ditemukan.");
  if (filePath.includes(",")) throw new Error("Path file memuat koma; tidak dapat dipasang ke Docker --mount.");

  const started = Date.now();
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "64",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    "--mount",
    `type=bind,source=${filePath},target=/analysis/input,readonly`,
    DEFAULT_IMAGE,
    "sh",
    "-c",
    profile.script,
  ];
  const result = await runDocker(args, 30_000, 300_000);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, 80_000);
  const status = result.ok ? "ok" : "error";
  await addToolRun({
    fileId: file.id,
    tool: `sandbox:${profile.id}`,
    args: [file.originalName],
    status,
    summary: (result.ok ? output.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | ") : result.error || result.stderr).slice(0, 400) || "Tidak ada output.",
    durationMs: Date.now() - started,
  });
  await audit("sandbox.run", `${profile.id} pada ${file.originalName}: ${status}`);
  return {
    output: output || "(tidak ada output)",
    command: `docker run --rm --network none … ${DEFAULT_IMAGE} sh -c "${profile.script}"`,
    durationMs: Date.now() - started,
    status,
  };
}
