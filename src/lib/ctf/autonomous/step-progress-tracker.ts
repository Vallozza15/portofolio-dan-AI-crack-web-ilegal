import { saveExecutionStep } from "../store";
import type { StepMeta } from "./execution-step-meta";
import { redactTraceText } from "./trace-redaction";
import type {
  CommandResult,
  ExecutionStep,
  ExecutionStepState,
  OrchestratorEvent,
  RemoteEnvironment,
} from "./types";

export interface StepOutcomeText {
  interpretation: string;
  result: string;
  nextAction: string;
}

/** Owns all step event emission so the engine never emits an untracked step. */
export class StepProgressTracker {
  constructor(
    private readonly emit: (event: OrchestratorEvent) => void,
    private readonly requestId: string,
    private readonly scope: { sessionId?: string; challengeId?: string } = {},
  ) {}

  begin(
    meta: StepMeta,
    command: string,
    environment: RemoteEnvironment,
    index: number,
  ): ExecutionStep {
    const step: ExecutionStep = {
      id: `step-${this.requestId}-${index}`,
      index,
      title: meta.title,
      objective: meta.objective,
      reason: meta.reason,
      expected: meta.expected,
      command: redactTraceText(command),
      environment,
      status: "PENDING",
      nextAction: meta.nextAction,
    };
    this.emit({ type: "step", step });
    this.update(step, "RUNNING");
    return step;
  }


  finish(
    step: ExecutionStep,
    result: CommandResult,
    outcome: StepOutcomeText,
  ): ExecutionStep {
    return this.update(step, result.status === "ok" ? "COMPLETED" : "FAILED", {
      cwd: result.cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      interpretation: outcome.interpretation,
      result: outcome.result,
      nextAction: outcome.nextAction,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      artifacts: result.artifacts,
    });
  }

  fail(step: ExecutionStep, message: string, nextAction: string): ExecutionStep {
    return this.update(step, "FAILED", {
      output: message,
      interpretation: "Perintah gagal dijalankan sebelum menghasilkan output.",
      result: "exit 1; tidak ada hasil eksekusi.",
      nextAction,
      exitCode: 1,
    });
  }

  verify(index: number, environment: RemoteEnvironment): ExecutionStep {
    const step: ExecutionStep = {
      id: `step-${this.requestId}-verify`,
      index,
      title: "Verifikasi akhir flag",
      objective: "Pastikan jawaban berasal dari server/oracle atau expectedFlag, bukan dari decode spontan.",
      reason: "Kandidat POTENTIAL tidak boleh dilaporkan sebagai flag terverifikasi.",
      expected: "Keputusan VERIFIED atau UNVERIFIED dari oracle/server.",
      command: "(verifikasi internal)",
      environment,
      status: "VERIFYING",
      output: "(verifikasi internal; tanpa perintah terminal)",
      nextAction: "Bandingkan kandidat dengan bukti verifikasi yang tersedia.",
    };
    this.emit({ type: "step", step });
    return step;
  }

  verified(
    step: ExecutionStep,
    status: ExecutionStepState,
    interpretation: string,
    result: string,
    nextAction: string,
  ): ExecutionStep {
    return this.update(step, status, { interpretation, result, nextAction });
  }

  update(
    step: ExecutionStep,
    status: ExecutionStepState,
    patch: Partial<ExecutionStep> = {},
  ): ExecutionStep {
    const next: ExecutionStep = { ...step, ...patch, status };
    if (next.command) next.command = redactTraceText(next.command);
    if (next.cwd) next.cwd = redactTraceText(next.cwd);
    if (next.stdout) next.stdout = redactTraceText(next.stdout);
    if (next.stderr) next.stderr = redactTraceText(next.stderr);
    if (next.output) next.output = redactTraceText(next.output);
    if (next.interpretation) next.interpretation = redactTraceText(next.interpretation);
    if (next.result) next.result = redactTraceText(next.result);
    if (next.nextAction) next.nextAction = redactTraceText(next.nextAction);
    this.emit({ type: "step", step: next });
    void saveExecutionStep({
      id: next.id,
      sessionId: this.scope.sessionId,
      challengeId: this.scope.challengeId,
      index: next.index,
      title: next.title,
      objective: next.objective,
      command: next.command,
      environment: next.environment,
      status: next.status,
      output: next.output,
      interpretation: next.interpretation,
      result: next.result,
      nextAction: next.nextAction,
    }).catch(() => undefined);
    return next;
  }
}
