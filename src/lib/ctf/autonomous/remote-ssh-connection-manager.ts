import { createHash } from "node:crypto";
import { runDockerWithInput } from "../sandbox";
import { decryptSecret } from "../secrets";
import { addRemoteAudit, getRemoteProfile, upsertRemoteConnection } from "../store";
import { ensureTerminal, execTerminal } from "../terminal";
import { AUTONOMOUS_LIMITS, authorizeRemoteEndpoint, normalizeFingerprint } from "./config";
import type {
  CommandResult,
  ConnectionSecrets,
  ConnectionStatusView,
  ExecutionRequest,
  RemoteConnectionStatus,
  RemoteProfileRecord,
} from "./types";

interface ManagedConnection {
  sessionId: string;
  profileId: string;
  containerName: string;
  secretDir: string;
  cwd: string;
  status: RemoteConnectionStatus;
  lastCommand?: string;
  lastExitCode?: number | null;
  connectedAt?: string;
  lastSeenAt: string;
  error?: string;
}

const connections = new Map<string, ManagedConnection>();

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sanitizeError(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value || "unknown error");
  text = text.replace(/-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g, "[PRIVATE KEY REDACTED]");
  text = text.replace(/(password|passphrase|private\s*key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
  text = text.replace(/sshpass\s+-f\s+\S+/gi, "sshpass -f [REDACTED]");
  return text.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | ").slice(0, 360);
}

function hostKeyEntry(line: string, host: string, port: number): { entry: string; fingerprint: string } | null {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const keyType = parts.find((part) => /^(ssh|ecdsa|sk)-/.test(part));
  if (!keyType) return null;
  const index = parts.indexOf(keyType);
  const blob = parts[index + 1];
  if (!blob || !/^[A-Za-z0-9+/=]+$/.test(blob)) return null;
  let raw: Buffer;
  try {
    raw = Buffer.from(blob, "base64");
  } catch {
    return null;
  }
  const fingerprint = createHash("sha256").update(raw).digest("base64");
  const hostToken = port === 22 ? host : `[${host}]:${port}`;
  return { entry: `${hostToken} ${keyType} ${blob}`, fingerprint };
}

async function writeTextToContainer(containerName: string, containerPath: string, content: string): Promise<void> {
  // docker cp cannot write into the container's writable tmpfs when the root
  // filesystem is read-only. Stream the bytes through docker exec stdin; the
  // path is an argv item and the secret itself never enters argv or logs.
  const written = await runDockerWithInput(
    ["exec", "-i", containerName, "sh", "-c", 'cat > "$1" && chmod 600 "$1"', "sh", containerPath],
    content,
    10_000,
  );
  if (!written.ok) {
    throw new Error(`Gagal menulis file kredensial SSH: ${sanitizeError(written.error || written.stderr)}`);
  }
}

async function resolveSecrets(profile: RemoteProfileRecord, override?: ConnectionSecrets): Promise<ConnectionSecrets> {
  const result: ConnectionSecrets = { ...override };
  if (!result.password && profile.passwordEnc) result.password = await decryptSecret(profile.passwordEnc);
  if (!result.privateKey && profile.privateKeyEnc) result.privateKey = await decryptSecret(profile.privateKeyEnc);
  if (!result.passphrase && profile.passphraseEnc) result.passphrase = await decryptSecret(profile.passphraseEnc);
  return result;
}

function authPrefix(profile: RemoteProfileRecord, secretDir: string, secrets: ConnectionSecrets): string {
  const passwordFile = `${secretDir}/password`;
  const passphraseFile = `${secretDir}/passphrase`;
  if (profile.authMethod === "password") {
    if (!secrets.password) throw new Error("Password remote belum tersedia.");
    return `sshpass -f ${shellQuote(passwordFile)} `;
  }
  if (profile.authMethod === "privateKey") {
    if (!secrets.privateKey) throw new Error("Private key remote belum tersedia.");
    if (secrets.passphrase) {
      return `sshpass -f ${shellQuote(passphraseFile)} -P ${shellQuote("Enter passphrase for key")} `;
    }
    return "";
  }
  return "";
}

function sshOptions(profile: RemoteProfileRecord, secretDir: string): string {
  const keyFile = `${secretDir}/id_key`;
  const knownHosts = `${secretDir}/known_hosts`;
  // BatchMode is intentionally omitted: sshpass needs the interactive
  // password/passphrase prompt to supply credentials from a mode-600 file.
  const options = [
    "-o StrictHostKeyChecking=yes",
    `-o UserKnownHostsFile=${shellQuote(knownHosts)}`,
    `-o ConnectTimeout=${Math.max(3, Math.ceil(profile.timeoutMs / 1000))}`,
    "-o ServerAliveInterval=5",
    "-o ServerAliveCountMax=2",
    "-o LogLevel=ERROR",
  ];
  if (profile.authMethod === "privateKey") {
    options.push(`-i ${shellQuote(keyFile)}`, "-o IdentitiesOnly=yes");
  } else if (profile.authMethod === "agent") {
    options.push("-o PreferredAuthentications=gssapi-with-mic,publickey");
  } else {
    options.push("-o PreferredAuthentications=password");
  }
  return options.join(" ");
}

function sshCommand(profile: RemoteProfileRecord, secretDir: string, secrets: ConnectionSecrets, remoteCommand: string): string {
  const target = `${shellQuote(profile.username)}@${shellQuote(profile.host)}`;
  return `${authPrefix(profile, secretDir, secrets)}ssh ${sshOptions(profile, secretDir)} -p ${profile.port} ${target} ${shellQuote(remoteCommand)}`;
}

function parseRemoteCwd(text: string): { output: string; cwd?: string } {
  const match = text.match(/\n?__CTF_REMOTE_CWD__:([^\r\n]+)/);
  if (!match) return { output: text };
  return {
    output: `${text.slice(0, match.index)}${text.slice((match.index || 0) + match[0].length)}`.trim(),
    cwd: match[1].trim(),
  };
}

async function persistStatus(connection: ManagedConnection): Promise<void> {
  const meta = extras.get(connection.sessionId);
  await upsertRemoteConnection({
    sessionId: connection.sessionId,
    profileId: connection.profileId,
    host: meta?.host || "",
    username: meta?.username || "",
    status: connection.status,
    cwd: connection.cwd,
    lastCommand: connection.lastCommand,
    lastExitCode: connection.lastExitCode,
    connectedAt: connection.connectedAt,
    lastSeenAt: connection.lastSeenAt,
    error: connection.error,
    createdAt: connection.connectedAt || connection.lastSeenAt,
    updatedAt: connection.lastSeenAt,
  });
}

/** Placeholder fields filled from the profile when a connection is created. */
interface ManagedConnectionExtras {
  host: string;
  username: string;
}

const extras = new Map<string, ManagedConnectionExtras>();

/**
 * Real SSH connection manager. Every command is executed by the existing
 * per-session Kali container using OpenSSH. Secrets are copied to a mode-600
 * tmpfs path only for the lifetime of the connection and never enter logs,
 * prompts, tool-run arguments, or AI context.
 */
export class RemoteSSHConnectionManager {
  async getStatus(sessionId: string): Promise<ConnectionStatusView> {
    const live = connections.get(sessionId);
    if (live) {
      return {
        profileId: live.profileId,
        environment: "remote-ctf",
        status: live.status,
        host: extras.get(sessionId)?.host || "",
        username: extras.get(sessionId)?.username || "",
        cwd: live.cwd,
        lastCommand: live.lastCommand,
        lastExitCode: live.lastExitCode,
        note:
          live.status === "connected"
            ? `Terhubung sebagai ${extras.get(sessionId)?.username || "user"} di ${extras.get(sessionId)?.host || "host"}.`
            : live.error || "Koneksi remote tidak aktif.",
        connectedAt: live.connectedAt,
      };
    }
    return {
      profileId: "",
      environment: "remote-ctf",
      status: "disconnected",
      host: "",
      username: "",
      cwd: "/",
      note: "Belum ada koneksi remote pada sesi ini.",
    };
  }

  isConnected(sessionId: string): boolean {
    return connections.get(sessionId)?.status === "connected";
  }

  async connect(sessionId: string, profileId: string, secretsOverride?: ConnectionSecrets): Promise<ConnectionStatusView> {
    const profile = await getRemoteProfile(profileId);
    if (!profile) throw new Error("Profil koneksi remote tidak ditemukan.");
    if (profile.sessionId !== sessionId) throw new Error("Profil koneksi tidak cocok dengan sesi ini.");
    if (!profile.authorized) throw new Error("Profil koneksi belum diotorisasi operator.");

    const authorization = authorizeRemoteEndpoint(profile.host, profile.port);
    if (!authorization.ok) throw new Error(authorization.reason);

    const expectedFingerprint = normalizeFingerprint(profile.hostKeyFingerprint);
    if (!expectedFingerprint) throw new Error("Sidik jari host key wajib diisi untuk verifikasi SSH.");

    const secrets = await resolveSecrets(profile, secretsOverride);
    if (profile.authMethod === "password" && !secrets.password) {
      throw new Error("Password remote belum tersedia pada profil ini.");
    }
    if (profile.authMethod === "privateKey" && !secrets.privateKey) {
      throw new Error("Private key remote belum tersedia pada profil ini.");
    }

    await this.disconnect(sessionId, "reconnect");
    const terminal = await ensureTerminal(sessionId);
    const secretDir = `/tmp/ctf-remote/${profile.id.replace(/[^A-Za-z0-9_-]/g, "")}`;
    const mkdir = await execTerminal({
      sessionId,
      command: `mkdir -p ${shellQuote(secretDir)}`,
      timeoutMs: 8_000,
      record: false,
      purpose: "Menyiapkan direktori kredensial SSH sementara",
    });
    if (mkdir.status !== "ok") throw new Error("Gagal menyiapkan direktori kredensial di container Kali.");

    const scan = await execTerminal({
      sessionId,
      command: `ssh-keyscan -T 10 -p ${profile.port} ${shellQuote(profile.host)}`,
      timeoutMs: 15_000,
      record: false,
      purpose: "Mengambil host key remote untuk verifikasi",
    });
    let matched: { entry: string; fingerprint: string } | null = null;
    for (const line of `${scan.stdout}\n${scan.stderr}`.split(/\r?\n/)) {
      const parsed = hostKeyEntry(line, profile.host, profile.port);
      if (parsed && normalizeFingerprint(parsed.fingerprint) === expectedFingerprint) {
        matched = parsed;
        break;
      }
    }
    if (!matched) {
      throw new Error("Host key server tidak cocok dengan sidik jari pada profil. Koneksi ditolak.");
    }

    await writeTextToContainer(terminal.containerName, `${secretDir}/known_hosts`, `${matched.entry}\n`);
    if (secrets.password) await writeTextToContainer(terminal.containerName, `${secretDir}/password`, secrets.password);
    if (secrets.privateKey) {
      const normalizedKey = secrets.privateKey.endsWith("\n") ? secrets.privateKey : `${secrets.privateKey}\n`;
      await writeTextToContainer(terminal.containerName, `${secretDir}/id_key`, normalizedKey);
    }
    if (secrets.passphrase) {
      await writeTextToContainer(terminal.containerName, `${secretDir}/passphrase`, secrets.passphrase);
    }

    const probeCommand = sshCommand(profile, secretDir, secrets, "printf __CTF_SSH_OK__");
    const probe = await execTerminal({
      sessionId,
      command: probeCommand,
      timeoutMs: profile.timeoutMs,
      record: false,
      purpose: "Memverifikasi koneksi SSH remote",
    });
    if (probe.status !== "ok" || !probe.stdout.includes("__CTF_SSH_OK__")) {
      throw new Error(`Koneksi SSH gagal: ${sanitizeError(probe.stderr || probe.output)}`);
    }

    const now = new Date().toISOString();
    const managed: ManagedConnection = {
      sessionId,
      profileId: profile.id,
      containerName: terminal.containerName,
      secretDir,
      cwd: profile.remoteCwd?.trim() || "~",
      status: "connected",
      connectedAt: now,
      lastSeenAt: now,
    };
    connections.set(sessionId, managed);
    extras.set(sessionId, { host: profile.host, username: profile.username });
    await persistStatus(managed);
    await addRemoteAudit({
      sessionId,
      profileId: profile.id,
      action: "remote.ssh.connect",
      detail: `${profile.username}@${profile.host}:${profile.port} fingerprint=${matched.fingerprint.slice(0, 16)}`,
    });
    return this.getStatus(sessionId);
  }

  async execute(sessionId: string, request: ExecutionRequest, allowRetry = true): Promise<CommandResult> {
    const managed = connections.get(sessionId);
    if (!managed || managed.status !== "connected") {
      throw new Error("Koneksi remote belum terbentuk. Hubungkan ke server CTF terlebih dahulu.");
    }
    const profile = await getRemoteProfile(managed.profileId);
    if (!profile) throw new Error("Profil koneksi remote tidak ditemukan.");
    const secrets = await resolveSecrets(profile);

    const remoteCommand = [
      `cd ${shellQuote(managed.cwd)} >/dev/null 2>&1 || cd ~`,
      request.command,
      "__ctf_remote_code=$?",
      `printf '\\n__CTF_REMOTE_CWD__:%s\\n' "$(pwd)"`,
      "exit $__ctf_remote_code",
    ].join("; ");

    const started = Date.now();
    const result = await execTerminal({
      sessionId,
      command: sshCommand(profile, managed.secretDir, secrets, remoteCommand),
      timeoutMs: request.timeoutMs || profile.timeoutMs || AUTONOMOUS_LIMITS.commandTimeoutMs,
      record: false,
      requestId: request.requestId,
      purpose: request.purpose,
      phase: "remote-ctf",
      challengeId: profile.challengeId,
    });
    const parsed = parseRemoteCwd(result.stdout);
    if (parsed.cwd) managed.cwd = parsed.cwd;
    managed.lastCommand = request.command;
    managed.lastExitCode = result.exitCode;
    managed.lastSeenAt = new Date().toISOString();
    managed.status = result.status === "ok" ? "connected" : "error";
    managed.error = result.status === "ok" ? undefined : sanitizeError(result.stderr || result.output);
    await persistStatus(managed);

    if (allowRetry && result.exitCode === 255 && /connection|timeout|reset|closed/i.test(result.stderr || result.output)) {
      await this.connect(sessionId, managed.profileId);
      return this.execute(sessionId, request, false);
    }

    await addRemoteAudit({
      sessionId,
      profileId: profile.id,
      action: "remote.ssh.exec",
      detail: `${request.purpose}: ${request.command.slice(0, 120)} [exit ${result.exitCode ?? "?"}]`,
    });

    return {
      commandId: result.commandId,
      environment: "remote-ctf",
      command: request.command,
      stdout: parsed.output,
      stderr: result.stderr,
      output: [parsed.output, result.stderr].filter(Boolean).join("\n"),
      exitCode: result.exitCode,
      status: result.status,
      cwd: managed.cwd,
      durationMs: Date.now() - started,
      artifacts: result.artifacts,
      note: `Remote ${extras.get(sessionId)?.host || "CTF"} (${managed.cwd}, exit ${result.exitCode ?? "?"})`,
    };
  }

  async disconnect(sessionId: string, reason = "operator"): Promise<void> {
    const managed = connections.get(sessionId);
    if (!managed) return;
    try {
      await execTerminal({
        sessionId,
        command: `rm -rf ${shellQuote(managed.secretDir)}`,
        timeoutMs: 8_000,
        record: false,
        purpose: "Membersihkan kredensial SSH sementara",
      });
    } catch {
      // Cleanup is best-effort; no secret value is ever logged.
    }
    const now = new Date().toISOString();
    managed.status = reason === "stop" ? "stopped" : "disconnected";
    managed.lastSeenAt = now;
    managed.error = undefined;
    await persistStatus(managed);
    connections.delete(sessionId);
    extras.delete(sessionId);
    await addRemoteAudit({
      sessionId,
      profileId: managed.profileId,
      action: "remote.ssh.disconnect",
      detail: reason,
    });
  }
}

export const remoteSSHConnectionManager = new RemoteSSHConnectionManager();
