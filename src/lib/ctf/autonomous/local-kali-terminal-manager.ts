import { ensureTerminal, execTerminal, type TerminalInfo } from "../terminal";
import type { CommandResult, ExecutionRequest } from "./types";

/**
 * Thin manager around the existing Docker-based Kali terminal. It never
 * starts a second terminal system; it only keeps an explicit environment
 * label so local files are never confused with remote challenge files.
 */
export class LocalKaliTerminalManager {
  async prepare(sessionId: string, fileIds?: string[]): Promise<void> {
    await ensureTerminal(sessionId, fileIds);
  }

  /** Starts or reuses the session container and returns discovered tools/files. */
  async prepareWithInfo(sessionId: string, fileIds?: string[]): Promise<TerminalInfo> {
    return ensureTerminal(sessionId, fileIds);
  }

  async execute(sessionId: string, request: ExecutionRequest): Promise<CommandResult> {
    const result = await execTerminal({
      sessionId,
      command: request.command,
      fileIds: [],
      timeoutMs: request.timeoutMs,
      record: true,
      requestId: request.requestId,
      purpose: request.purpose,
      phase: "local-kali",
    });
    return {
      commandId: result.commandId,
      environment: "local-kali",
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      exitCode: result.exitCode,
      status: result.status,
      cwd: result.cwd,
      durationMs: result.durationMs,
      artifacts: result.artifacts,
      note: `Lokal Kali (${result.cwd}, exit ${result.exitCode ?? "?"})`,
    };
  }
}
