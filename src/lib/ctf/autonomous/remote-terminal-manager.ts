import { getRemoteProfile } from "../store";
import { validateRemoteCommand } from "../remote-policy";
import { remoteSSHConnectionManager } from "./remote-ssh-connection-manager";
import type { CommandResult, ExecutionRequest } from "./types";

/**
 * Remote shell abstraction. It keeps remote state separate from the local
 * Kali container and validates every command before it reaches the SSH layer.
 */
export class RemoteTerminalManager {
  async execute(sessionId: string, request: ExecutionRequest): Promise<CommandResult> {
    const profileId = remoteSSHConnectionManager.isConnected(sessionId)
      ? (await remoteSSHConnectionManager.getStatus(sessionId)).profileId
      : "";
    const profile = profileId ? await getRemoteProfile(profileId) : null;
    const validation = validateRemoteCommand(request.command, {
      allowStateChange: request.allowStateChange,
      authorizedHost: profile?.host,
    });
    if (!validation.ok) {
      return {
        commandId: `blocked-${Date.now()}`,
        environment: "remote-ctf",
        command: request.command,
        stdout: "",
        stderr: validation.reason,
        output: validation.reason,
        exitCode: null,
        status: "blocked",
        cwd: (await remoteSSHConnectionManager.getStatus(sessionId)).cwd,
        durationMs: 0,
        artifacts: [],
        note: validation.requiresAuthorization
          ? "Perintah memerlukan otorisasi perubahan state."
          : "Perintah ditolak kebijakan keamanan remote.",
      };
    }
    return remoteSSHConnectionManager.execute(sessionId, request);
  }

  async inspect(sessionId: string): Promise<CommandResult> {
    return this.execute(sessionId, {
      command: "pwd; ls -la; printf '--- challenge hints ---\\n'; grep -RniE 'hint|clue|flag|stage|next|petunjuk' . 2>/dev/null | head -n 40",
      purpose: "Membaca kondisi dan petunjuk pada shell remote",
      environment: "remote-ctf",
      timeoutMs: 25_000,
    });
  }

  async readTerminal(sessionId: string): Promise<CommandResult> {
    return this.execute(sessionId, {
      command: "pwd; ls -la; printf '--- recent files ---\\n'; find . -maxdepth 2 -type f -printf '%TY-%Tm-%Td %TH:%TM %p\\n' 2>/dev/null | sort | tail -n 30",
      purpose: "Membaca output dan berkas terkini pada terminal remote",
      environment: "remote-ctf",
      timeoutMs: 25_000,
    });
  }
}
