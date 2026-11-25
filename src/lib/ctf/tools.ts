import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { addToolRun, audit, getFileRecord, getSettings, getUploadDir } from "./store";
import { getTerminalStatus } from "./terminal";
import type { ToolRun, ToolStatus } from "./types";

interface CommandResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  durationMs: number;
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs = 4000,
  maxOutput = 128_000,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;
    try {
      child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        ok: false,
        code: null,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      });
      return;
    }
    const finish = (result: Omit<CommandResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: `Timeout setelah ${timeoutMs} ms.`,
      });
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, code, stdout, stderr });
    });
  });
}

interface ToolDefinition {
  name: string;
  command: string;
  versionArgs: string[];
  category: string;
  purpose: string;
}

const CATALOG: ToolDefinition[] = [
  { name: "file", command: "file", versionArgs: ["--version"], category: "forensics", purpose: "Identifikasi tipe file dari magic bytes." },
  { name: "strings", command: "strings", versionArgs: ["--version"], category: "forensics", purpose: "Ekstraksi string cetak dari binary." },
  { name: "exiftool", command: "exiftool", versionArgs: ["-ver"], category: "forensics", purpose: "Metadata EXIF dan dokumen." },
  { name: "readelf", command: "readelf", versionArgs: ["--version"], category: "reverse", purpose: "Header dan section ELF." },
  { name: "objdump", command: "objdump", versionArgs: ["--version"], category: "reverse", purpose: "Disassembly dan header objek." },
  { name: "tshark", command: "tshark", versionArgs: ["-v"], category: "forensics", purpose: "Analisis PCAP berbasis Wireshark." },
  { name: "binwalk", command: "binwalk", versionArgs: ["--help"], category: "forensics", purpose: "Deteksi file tertanam dalam firmware/arsip." },
  { name: "checksec", command: "checksec", versionArgs: ["--help"], category: "binary", purpose: "Mitigasi keamanan binary (NX, PIE, canary)." },
  { name: "pdfinfo", command: "pdfinfo", versionArgs: ["-v"], category: "forensics", purpose: "Metadata dan jumlah halaman PDF." },
  { name: "zsteg", command: "zsteg", versionArgs: ["--version"], category: "steganography", purpose: "Deteksi LSB pada PNG/BMP." },
  { name: "steghide", command: "steghide", versionArgs: ["--version"], category: "steganography", purpose: "Steganografi JPEG/audio (butuh passphrase)." },
  { name: "foremost", command: "foremost", versionArgs: ["-V"], category: "forensics", purpose: "File carving dari disk image." },
  { name: "volatility3", command: "vol", versionArgs: ["--help"], category: "forensics", purpose: "Analisis memory dump." },
  { name: "radare2", command: "r2", versionArgs: ["-v"], category: "reverse", purpose: "Disassembly dan analisis binary." },
  { name: "ghidra", command: "ghidra", versionArgs: ["-help"], category: "reverse", purpose: "Decompiler dan reverse engineering." },
  { name: "gdb", command: "gdb", versionArgs: ["--version"], category: "binary", purpose: "Debugger untuk analisis runtime." },
  { name: "nmap", command: "nmap", versionArgs: ["--version"], category: "network", purpose: "Pemindaian port pada lab terotorisasi." },
  { name: "hashcat", command: "hashcat", versionArgs: ["--version"], category: "cryptography", purpose: "Password recovery (GPU/CPU)." },
  { name: "john", command: "john", versionArgs: ["--version"], category: "cryptography", purpose: "Password cracking." },
  { name: "docker", command: "docker", versionArgs: ["--version"], category: "sandbox", purpose: "Isolasi eksekusi di container." },
];

let statusCache: { at: number; statuses: ToolStatus[] } | null = null;

export async function getToolStatuses(force = false): Promise<ToolStatus[]> {
  if (!force && statusCache && Date.now() - statusCache.at < 60_000) {
    return statusCache.statuses;
  }
  const terminal = await getTerminalStatus(force);
  const imageReady =
    terminal.dockerInstalled && terminal.daemonRunning && terminal.imagePresent;

  const statuses = await Promise.all(
    CATALOG.map(async (tool): Promise<ToolStatus> => {
      if (tool.command === "docker") {
        const result = await runCommand(tool.command, tool.versionArgs, 2500, 16_000);
        const versionLine = (result.stdout || result.stderr)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);
        return {
          name: tool.name,
          command: tool.command,
          installed: !result.error || !/ENOENT/i.test(result.error),
          version: result.error && /ENOENT/i.test(result.error) ? undefined : versionLine?.slice(0, 140),
          category: tool.category,
          purpose: tool.purpose,
        };
      }
      return {
        name: tool.name,
        command: tool.command,
        installed: imageReady,
        version: imageReady ? "Tersedia di image Kali" : undefined,
        category: tool.category,
        purpose: tool.purpose,
      };
    }),
  );
  statusCache = { at: Date.now(), statuses };
  return statuses;
}

interface HostToolProfile {
  id: string;
  tool: string;
  label: string;
  args: (filePath: string) => string[];
  timeoutMs: number;
}

const PROFILES: HostToolProfile[] = [
  { id: "file-identify", tool: "file", label: "file", args: (filePath) => [filePath], timeoutMs: 10_000 },
  { id: "strings", tool: "strings", label: "strings -n 4", args: (filePath) => ["-n", "4", filePath], timeoutMs: 15_000 },
  { id: "exiftool", tool: "exiftool", label: "exiftool -j", args: (filePath) => ["-j", filePath], timeoutMs: 15_000 },
  { id: "readelf-header", tool: "readelf", label: "readelf -h", args: (filePath) => ["-h", filePath], timeoutMs: 10_000 },
  { id: "objdump-headers", tool: "objdump", label: "objdump -f", args: (filePath) => ["-f", filePath], timeoutMs: 10_000 },
  { id: "tshark-summary", tool: "tshark", label: "tshark -r -c 200", args: (filePath) => ["-r", filePath, "-c", "200"], timeoutMs: 25_000 },
  { id: "binwalk-scan", tool: "binwalk", label: "binwalk", args: (filePath) => [filePath], timeoutMs: 25_000 },
  { id: "checksec", tool: "checksec", label: "checksec --file", args: (filePath) => [`--file=${filePath}`], timeoutMs: 10_000 },
  { id: "pdfinfo", tool: "pdfinfo", label: "pdfinfo", args: (filePath) => [filePath], timeoutMs: 10_000 },
  { id: "zsteg", tool: "zsteg", label: "zsteg", args: (filePath) => [filePath], timeoutMs: 20_000 },
];

export function listHostToolProfiles() {
  return PROFILES.map((profile) => ({
    id: profile.id,
    tool: profile.tool,
    label: profile.label,
    timeoutMs: profile.timeoutMs,
  }));
}

export interface HostToolRunResult {
  run: ToolRun;
  output: string;
  command: string;
  blocked?: boolean;
}

export async function runHostTool(profileId: string, fileId: string): Promise<HostToolRunResult> {
  const settings = await getSettings();
  const profile = PROFILES.find((item) => item.id === profileId);
  if (!profile) throw new Error("Profil tool tidak dikenal.");
  const file = await getFileRecord(fileId);
  if (!file) throw new Error("File tidak ditemukan.");
  const uploadDir = path.resolve(getUploadDir());
  const filePath = path.resolve(uploadDir, file.storageName);
  if (!filePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw new Error("Path file berada di luar direktori upload.");
  }
  if (!existsSync(filePath)) throw new Error("File fisik tidak ditemukan di storage.");

  if (!settings.system.hostToolsEnabled) {
    const run = await addToolRun({
      fileId: file.id,
      tool: profile.label,
      args: [file.originalName],
      status: "blocked",
      summary: "Host tools dinonaktifkan di System Settings. Gunakan parser bawaan atau aktifkan secara sadar.",
      durationMs: 0,
    });
    return {
      run,
      output: "Host tools dinonaktifkan. Aktifkan di /ctf/settings setelah memahami risikonya.",
      command: profile.label,
      blocked: true,
    };
  }

  const started = Date.now();
  const result = await runCommand(profile.tool, profile.args(filePath), profile.timeoutMs, 2_000_000);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, 60_000);
  const summary = result.ok
    ? `${profile.label}: ${output.split(/\r?\n/).filter(Boolean).length} baris output.`
    : `${profile.label} gagal: ${(result.error || result.stderr || `exit ${result.code}`).slice(0, 300)}`;
  const run = await addToolRun({
    fileId: file.id,
    tool: profile.label,
    args: [file.originalName],
    status: result.ok ? "ok" : "error",
    summary,
    durationMs: Date.now() - started,
  });
  await audit("tool.host.run", `${profile.label} pada ${file.originalName}: ${result.ok ? "ok" : "error"}`);
  return {
    run,
    output: output || "(tidak ada output)",
    command: `${profile.tool} ${profile.args(filePath).join(" ")}`,
  };
}
