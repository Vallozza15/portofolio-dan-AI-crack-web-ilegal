import { ensureChallengeState, getChallengeState, updateChallengeState } from "../store";
import type {
  ChallengeHintRecord,
  ChallengeStateRecord,
  CommandHistoryRecord,
  CommandResult,
  DecodingAttempt,
} from "./types";

/**
 * Durable memory for the current challenge. Every discovered hint, decoded
 * message, command, failure, success, and unresolved task is persisted in the
 * single CTF store so a follow-up resumes instead of restarting.
 */
export class ChallengeContextMemory {
  async load(sessionId: string, challengeId?: string): Promise<ChallengeStateRecord> {
    return (await getChallengeState(sessionId, challengeId)) || ensureChallengeState(sessionId, challengeId);
  }

  async save(state: ChallengeStateRecord): Promise<ChallengeStateRecord> {
    return (await updateChallengeState(state.id, {
      stage: state.stage,
      originalInstructions: state.originalInstructions,
      hints: state.hints,
      decodedMessages: state.decodedMessages,
      commands: state.commands,
      failures: state.failures,
      successes: state.successes,
      currentStageIndicator: state.currentStageIndicator,
      confirmedFindings: state.confirmedFindings,
      unresolvedTasks: state.unresolvedTasks,
      finalStatus: state.finalStatus,
      verifiedFlag: state.verifiedFlag,
      expectedFlag: state.expectedFlag,
      flagFormat: state.flagFormat,
    })) || state;
  }

  addHint(state: ChallengeStateRecord, hint: ChallengeHintRecord): void {
    if (!hint.original || state.hints.some((item) => item.original === hint.original)) return;
    state.hints.push(hint);
    state.unresolvedTasks = state.unresolvedTasks.filter((task) => task !== hint.original);
  }

  addDecoded(state: ChallengeStateRecord, attempt: DecodingAttempt, source: string): void {
    if (!attempt.value || state.decodedMessages.some((item) => item.value === attempt.value && item.source === source)) {
      return;
    }
    state.decodedMessages.push({
      value: attempt.value,
      path: attempt.path,
      source,
      createdAt: new Date().toISOString(),
    });
  }

  addCommand(state: ChallengeStateRecord, result: CommandResult, purpose: string): void {
    const record: CommandHistoryRecord = {
      id: result.commandId,
      environment: result.environment,
      command: result.command,
      stdout: result.stdout.slice(0, 8_000),
      stderr: result.stderr.slice(0, 4_000),
      exitCode: result.exitCode,
      status: result.status,
      purpose,
      cwd: result.cwd,
      createdAt: new Date().toISOString(),
    };
    state.commands = [...state.commands, record].slice(-200);
  }

  addFailure(state: ChallengeStateRecord, reason: string): void {
    if (reason && !state.failures.includes(reason)) state.failures.push(reason);
  }

  addSuccess(state: ChallengeStateRecord, finding: string): void {
    if (finding && !state.successes.includes(finding)) state.successes.push(finding);
  }

  addFinding(state: ChallengeStateRecord, finding: string): void {
    if (finding && !state.confirmedFindings.includes(finding)) state.confirmedFindings.push(finding);
  }

  addUnresolved(state: ChallengeStateRecord, task: string): void {
    if (task && !state.unresolvedTasks.includes(task)) state.unresolvedTasks.push(task);
  }

  resolve(state: ChallengeStateRecord, task: string): void {
    state.unresolvedTasks = state.unresolvedTasks.filter((item) => item !== task);
  }
}
