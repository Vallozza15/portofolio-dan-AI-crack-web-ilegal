import { extractFlagCandidates } from "../flag";
import { getChallenge, listVerificationRecords, saveVerificationRecord } from "../store";
import type { TerminalInfo } from "../terminal";
import { buildPairedCommands } from "./tool-pairing";
import { AUTONOMOUS_LIMITS, authorizeRemoteEndpoint, operationalMessage } from "./config";
import { stopAutonomousRun } from "./control";
import { AdaptiveExecutionEngineHelpers } from "./adaptive-execution-helpers";
import { AntiRepetitionEngine } from "./anti-repetition-engine";
import { ChallengeCompletionDetector } from "./challenge-completion-detector";
import { ChallengeContextMemory } from "./challenge-context-memory";
import { researchCyLabChallenge } from "./cylab-challenge-research";
import { ErrorRecoveryManager } from "./error-recovery-manager";
import {
  ExecutionPlanGenerator,
  HintInterpretationEngine,
  KaliCommandGenerator,
  LiveOutputReader,
  MultiMethodValidator,
  TerminalExecutionManager,
} from "./required-modules";
import { buildStepMeta, describeStepOutcome } from "./execution-step-meta";
import { FinalAnswerVerifier } from "./final-answer-verifier";
import { MultiStageChallengeManager } from "./multi-stage-challenge-manager";
import { extractServerVerifiedFlag } from "./oracle-flag-verifier";
import { findProfileForSession, saveRemoteProfile } from "./remote-profile-service";
import { RemoteSSHConnectionManager, remoteSSHConnectionManager } from "./remote-ssh-connection-manager";
import { StepProgressTracker } from "./step-progress-tracker";
import type { TerminalOutputReader } from "./terminal-output-reader";
import { redactTraceText } from "./trace-redaction";
import { UserResponseController } from "./user-response-controller";
import { FlagVerificationEngine } from "./flag-verification-engine";
import { formatFinalReport } from "./final-response-format";
import type {
  AnswerVerification,
  AutonomousRunInput,
  AutonomousRunResult,
  CandidateSolution,
  ChallengeStateRecord,
  CommandResult,
  CompletionResult,
  ExecutionStepState,
  StructuredPlan,
} from "./types";

interface ProcessedOutput {
  reading: ReturnType<TerminalOutputReader["read"]>;
  interpretations: ReturnType<HintInterpretationEngine["interpret"]>;
  candidates: CandidateSolution[];
  completion: CompletionResult;
  continuationSignals: string[];
}

/**
 * Executes the plan through real terminal managers and turns observed output
 * into the next justified action. It never emits an internal analysis report.
 */
export class AdaptiveExecutionEngine {
  private readonly memory = new ChallengeContextMemory();
  private readonly stages = new MultiStageChallengeManager(this.memory);
  private readonly reader = new LiveOutputReader();
  private readonly hints = new HintInterpretationEngine();
  private readonly repetition = new AntiRepetitionEngine();
  private readonly validator = new MultiMethodValidator();
  private readonly verifier = new FlagVerificationEngine();
  private readonly completionDetector = new ChallengeCompletionDetector();
  private readonly finalVerifier = new FinalAnswerVerifier();
  private readonly planGenerator = new ExecutionPlanGenerator();
  private readonly recovery = new ErrorRecoveryManager();
  private readonly responses = new UserResponseController();
  private readonly commands = new KaliCommandGenerator();
  private readonly terminals = new TerminalExecutionManager();

  constructor(private readonly ssh: RemoteSSHConnectionManager = remoteSSHConnectionManager) {}

  async run(plan: StructuredPlan, input: AutonomousRunInput): Promise<AutonomousRunResult> {
    const state = await this.stages.initialize(
      input.sessionId,
      input.challengeId || plan.session.challengeId,
      plan.operation === "GENERAL_QUESTION" ? [] : [input.question],
    );
    await this.attachChallengeMetadata(state, input.challengeId || plan.session.challengeId);

    if (plan.operation === "GENERAL_QUESTION") {
      return {
        answer: "",
        status: state.finalStatus,
        operation: plan.operation,
        stage: state.stage,
      };
    }
    if (plan.operation === "REQUEST_REPORT") {
      return {
        answer:
          input.language === "id"
            ? "Laporan permanen tersedia melalui menu Reports."
            : "The permanent report is available from the Reports menu.",
        status: state.finalStatus,
        operation: plan.operation,
        stage: state.stage,
      };
    }
    if (plan.operation === "STOP") {
      stopAutonomousRun(input.sessionId);
      await this.ssh.disconnect(input.sessionId, "stop");
      this.emit(input, { type: "note", message: operationalMessage(input.language, "stopped") });
      return {
        answer: operationalMessage(input.language, "stopped"),
        status: "UNSOLVED",
        operation: plan.operation,
        stage: state.stage,
      };
    }
    if (plan.operation === "DISCONNECT") {
      await this.ssh.disconnect(input.sessionId);
      this.emit(input, { type: "note", message: operationalMessage(input.language, "disconnected") });
      return {
        answer: operationalMessage(input.language, "disconnected"),
        status: state.finalStatus,
        operation: plan.operation,
        stage: state.stage,
      };
    }
    if (plan.operation === "CHECK_STATUS") {
      const status = await this.ssh.getStatus(input.sessionId);
      return {
        answer: `${status.note} Tahap ${state.stage}; status ${state.finalStatus}.`,
        status: state.finalStatus,
        operation: plan.operation,
        stage: state.stage,
        connection: status,
      };
    }

    if (plan.operation === "VERIFY_ANSWER") {
      return this.verifyStoredAnswer(plan, input, state);
    }

    if (plan.operation === "EXPLAIN_SOLUTION") {
      return this.explainSolution(plan, input, state);
    }

    if (
      plan.operation === "AUTO_ANALYZE" ||
      plan.operation === "NETCAT_CONNECT" ||
      plan.operation === "GIT_CLONE"
    ) {
      return this.solveLocally(plan, input, state);
    }

    if (plan.missing.length) {
      return {
        answer: this.responses.final({
          language: input.language,
          status: "UNSOLVED",
          missing: plan.missing,
        }),
        status: "UNSOLVED",
        operation: plan.operation,
        stage: state.stage,
      };
    }

    const profile = await this.resolveProfile(plan, input);
    if (!profile) {
      if (canSolveLocally(plan.operation, input)) {
        return this.solveLocally(plan, input, state);
      }
      return {
        answer: this.responses.final({
          language: input.language,
          status: "UNSOLVED",
          missing:
            plan.operation === "SAVE_PROFILE"
              ? input.language === "id"
                ? ["Nama profil, host, username, sidik jari host key, dan kredensial"]
                : ["Profile name, host, username, host-key fingerprint, and credentials"]
              : input.language === "id"
                ? ["Nama profil koneksi CTF yang sudah diotorisasi"]
                : ["Name of an authorized CTF connection profile"],
        }),
        status: "UNSOLVED",
        operation: plan.operation,
        stage: state.stage,
      };
    }

    if (plan.operation === "SAVE_PROFILE") {
      return {
        answer:
          input.language === "id"
            ? `Profil ${profile.name} tersimpan.`
            : `Profile ${profile.name} saved.`,
        status: state.finalStatus,
        operation: plan.operation,
        profileId: profile.id,
        stage: state.stage,
        connection: await this.ssh.getStatus(input.sessionId),
      };
    }

    if (plan.operation === "CONNECT_REMOTE") {
      this.emit(input, { type: "note", message: operationalMessage(input.language, "connecting") });
      try {
        const connection = await this.ssh.connect(input.sessionId, profile.id);
        this.emit(input, { type: "note", message: operationalMessage(input.language, "connected") });
        return {
          answer: connection.note,
          status: state.finalStatus,
          operation: plan.operation,
          profileId: profile.id,
          stage: state.stage,
          connection,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit(input, { type: "error", message });
        return {
          answer: message,
          status: "UNSOLVED",
          operation: plan.operation,
          profileId: profile.id,
          stage: state.stage,
        };
      }
    }

    if (!this.ssh.isConnected(input.sessionId)) {
      this.emit(input, { type: "note", message: operationalMessage(input.language, "connecting") });
      try {
        await this.ssh.connect(input.sessionId, profile.id);
        this.emit(input, { type: "note", message: operationalMessage(input.language, "connected") });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit(input, { type: "error", message });
        return {
          answer: message,
          status: "UNSOLVED",
          operation: plan.operation,
          profileId: profile.id,
          stage: state.stage,
        };
      }
    }

    if (plan.operation === "READ_TERMINAL" || plan.operation === "INSPECT_REMOTE" || plan.operation === "FOLLOW_HINT") {
      this.emit(input, { type: "note", message: operationalMessage(input.language, "reading") });
      const result =
        plan.operation === "INSPECT_REMOTE" || plan.operation === "FOLLOW_HINT"
          ? await this.terminals.inspect(input.sessionId)
          : await this.terminals.readTerminal(input.sessionId);
      const processed = await this.processOutput(result, state, input);
      await this.memory.save(state);
      const useful = processed.reading.observations.find((item) => item.kind === "hint" || item.kind === "instruction");
      return {
        answer:
          useful?.text.slice(0, 400) ||
          (input.language === "id"
            ? "Output terminal terbaca. Belum ada instruksi tambahan yang terdeteksi."
            : "Terminal output read. No additional instruction detected yet."),
        status: state.finalStatus,
        operation: plan.operation,
        profileId: profile.id,
        stage: state.stage,
        verifiedFlag: state.verifiedFlag,
        connection: await this.ssh.getStatus(input.sessionId),
      };
    }

    return this.solveLoop(plan, input, state, profile.id, plan.operation === "CONTINUE_CHALLENGE" || plan.operation === "SOLVE_UNTIL_FLAG" || plan.operation === "DECODE_MESSAGE" || plan.operation === "INVESTIGATE_NEXT_STAGE");
  }

  private emit(input: AutonomousRunInput, event: Parameters<NonNullable<AutonomousRunInput["onEvent"]>>[0]): void {
    input.onEvent?.(event);
  }

  private async attachChallengeMetadata(state: ChallengeStateRecord, challengeId?: string): Promise<void> {
    if (!challengeId) return;
    const challenge = await getChallenge(challengeId);
    if (!challenge) return;
    state.expectedFlag = challenge.expectedFlag;
    state.flagFormat = challenge.flagFormat || "flag{...}";
    if (challenge.description) this.memory.addFinding(state, challenge.description.slice(0, 500));
  }

  private async resolveProfile(plan: StructuredPlan, input: AutonomousRunInput) {
    const target = plan.target || {};
    const identifier = target.profileId || target.name || this.extractProfileName(input.question);
    const hasInlineConnection = Boolean(target.host && target.username && target.fingerprint && target.authMethod);
    const hasInlineSecret = Boolean(plan.extractedSecrets?.length);
    if (hasInlineConnection || hasInlineSecret) {
      const existing = await findProfileForSession(input.sessionId, identifier);
      const secret = (field: "password" | "privateKey" | "passphrase") =>
        plan.extractedSecrets?.find((item) => item.field === field)?.value;
      const authMethod = target.authMethod || (secret("privateKey") ? "privateKey" : "password");
      const saved = await saveRemoteProfile({
        sessionId: input.sessionId,
        name: existing?.name || target.name || `${target.host || "ctf"}:${target.port || 22}`,
        host: target.host || existing?.host || "",
        port: target.port || existing?.port || 22,
        username: target.username || existing?.username || "",
        authMethod,
        hostKeyFingerprint: target.fingerprint || existing?.hostKeyFingerprint || "",
        challengeId: input.challengeId || existing?.challengeId,
        remoteCwd: target.remoteCwd || existing?.remoteCwd,
        timeoutMs: existing?.timeoutMs,
        allowStateChanges: existing?.allowStateChanges || plan.permissions.stateChange,
        password: secret("password"),
        privateKey: secret("privateKey"),
        passphrase: secret("passphrase"),
      });
      return getProfileById(saved.id);
    }
    return findProfileForSession(input.sessionId, identifier);
  }

  private extractProfileName(question: string): string | undefined {
    const match = question.match(/\b(?:profil|profile)\s+([A-Za-z0-9_.-]+)/i);
    return match?.[1];
  }

  private async solveLocally(
    plan: StructuredPlan,
    input: AutonomousRunInput,
    state: ChallengeStateRecord,
  ): Promise<AutonomousRunResult> {
    if (plan.operation === "NETCAT_CONNECT" || plan.operation === "GIT_CLONE") {
      const target =
        plan.target?.host && plan.target.port !== undefined
          ? { host: plan.target.host, port: plan.target.port }
          : plan.operation === "NETCAT_CONNECT"
            ? netcatTarget(input.question)
            : undefined;
      if (!target) {
        return Promise.resolve({
          answer:
            plan.operation === "GIT_CLONE"
              ? input.language === "id"
                ? "Dibutuhkan: host dan port repository git."
                : "Required: git repository host and port."
              : input.language === "id"
                ? "Dibutuhkan: host dan port tujuan nc."
                : "Required: netcat target host and port.",
          status: "UNSOLVED",
          operation: plan.operation,
          stage: state.stage,
        });
      }
      const authorization = authorizeRemoteEndpoint(target.host, target.port);
      if (!authorization.ok) {
        return {
          answer: authorization.reason,
          status: "UNSOLVED",
          operation: plan.operation,
          stage: state.stage,
        };
      }
      if (target.host.endsWith(".cylabacademy.net")) {
        this.emit(input, {
          type: "note",
          message:
            input.language === "id"
              ? "Mencari identitas challenge dari sumber resmi CyLab Academy sebelum menjalankan terminal."
              : "Looking up challenge identity from the official CyLab Academy source before running the terminal.",
        });
        try {
          const research = await researchCyLabChallenge(target.host, target.port, input.language);
          for (const note of research.notes) this.emit(input, { type: "note", message: note });
        } catch (error) {
          this.emit(input, {
            type: "note",
            message:
              input.language === "id"
                ? `Riset CyLab dilewati: ${error instanceof Error ? error.message : String(error)}`
                : `CyLab research skipped: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }
    return this.solveLoop(plan, input, state, "", true, true);
  }

  private async solveLoop(
    plan: StructuredPlan,
    input: AutonomousRunInput,
    state: ChallengeStateRecord,
    profileId: string,
    continueUntilFlag: boolean,
    local = false,
  ): Promise<AutonomousRunResult> {
    const deadline = Date.now() + AUTONOMOUS_LIMITS.timeBudgetMs;
    let lastProcessed: ProcessedOutput | null = null;
    let lastOutput = "";
    let localInfo: TerminalInfo | null = null;
    let stepIndex = 0;
    const tracker = new StepProgressTracker(
      (event) => this.emit(input, event),
      input.requestId,
      { sessionId: input.sessionId, challengeId: input.challengeId },
    );

    const planSummary = this.planGenerator.summarize(
      plan,
      [input.question, ...state.hints.map((hint) => hint.original)].join("\n"),
      local ? "local-kali" : "remote-ctf",
    );
    this.emit(input, {
      type: "execution-plan",
      category: planSummary.category,
      strategy: planSummary.strategy,
      environment: planSummary.environment,
      operation: planSummary.operation,
    });

    if (local) {
      this.emit(input, { type: "note", message: operationalMessage(input.language, "runningLocal") });
      try {
        localInfo = await this.terminals.prepare(input.sessionId, input.fileIds);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit(input, { type: "error", message });
        return {
          answer: message,
          status: "UNSOLVED",
          operation: plan.operation,
          stage: state.stage,
        };
      }
    }

    for (let iteration = 0; iteration < AUTONOMOUS_LIMITS.maxIterations; iteration += 1) {
      if (input.signal?.aborted || Date.now() > deadline) break;
      const command = local
        ? this.chooseLocalCommand(plan, state, iteration, localInfo, input, lastOutput)
        : this.chooseCommand(state, iteration);
      if (!command) {
        this.memory.addUnresolved(
          state,
          input.language === "id" ? "Petunjuk atau berkas berikutnya belum tersedia" : "Next hint or file is not available",
        );
        break;
      }
      const history = state.commands.map((item) => item.command);
      const repetition = this.repetition.check(command, history, AUTONOMOUS_LIMITS.maxRepeatedCommands);
      if (repetition.repeated) {
        this.memory.addFailure(state, `Perintah diulang: ${command.slice(0, 120)}`);
        continue;
      }

      const phase = `Iterasi ${iteration + 1}: ${state.currentStageIndicator || (local ? "analisis lokal" : "investigasi challenge")}`;
      const environment = local ? "local-kali" : "remote-ctf";
      stepIndex += 1;
      const meta = buildStepMeta(plan, iteration);
      const currentStep = tracker.begin(meta, command, environment, stepIndex);
      const stepId = currentStep.id;
      this.emit(input, {
        type: "command",
        commandId: `trace-${input.requestId}-${iteration}`,
        stepId,
        command: redactTraceText(command),
        phase,
      });
      let result: CommandResult;
      try {
        result = local
          ? await this.terminals.execute(input.sessionId, "local-kali", {
              command,
              purpose: phase,
              environment: "local-kali",
              timeoutMs:
                plan.operation === "NETCAT_CONNECT" || plan.operation === "GIT_CLONE"
                  ? Math.max(AUTONOMOUS_LIMITS.commandTimeoutMs, 90_000)
                  : AUTONOMOUS_LIMITS.commandTimeoutMs,
              requestId: input.requestId,
            })
          : await this.terminals.execute(input.sessionId, "remote-ctf", {
              command,
              purpose: phase,
              environment: "remote-ctf",
              requestId: input.requestId,
              allowStateChange: Boolean(
                plan.permissions.stateChange && profileAllowsStateChanges(await getProfileById(profileId)),
              ),
            });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit(input, {
          type: "output",
          commandId: `trace-${input.requestId}-${iteration}`,
          stepId,
          command: redactTraceText(command),
          phase,
          output: redactTraceText(message),
          status: "error",
          exitCode: 1,
        });
        tracker.fail(
          currentStep,
          message,
          this.recovery.suggest({
            errorText: message,
            command,
            history,
            category: planSummary.category,
          }),
        );
        this.memory.addFailure(state, `Perintah gagal dijalankan: ${message.slice(0, 160)}`);
        continue;
      }
      this.emit(input, {
        type: "output",
        commandId: result.commandId,
        stepId,
        command: redactTraceText(result.command),
        phase,
        cwd: result.cwd,
        stdout: redactTraceText(result.stdout),
        stderr: redactTraceText(result.stderr),
        output: redactTraceText(result.output),
        status: result.status,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        artifacts: result.artifacts,
      });
      lastOutput = [result.stdout, result.stderr].filter(Boolean).join("\n");
      this.memory.addCommand(state, result, `Iterasi ${iteration + 1}`);
      if (result.status === "error") {
        this.memory.addFailure(state, `${command.slice(0, 120)} → ${result.stderr.slice(0, 160)}`);
      }
      const processed = await this.processOutput(result, state, input);
      lastProcessed = processed;
      this.stages.advance(state, processed.continuationSignals, processed.completion);
      await this.memory.save(state);

      const outcome = describeStepOutcome({
        commandStatus: result.status,
        exitCode: result.exitCode,
        stderr: result.stderr,
        output: result.output,
        failureIndicators: processed.reading.failureIndicators,
        successIndicators: processed.reading.successIndicators,
        continuationSignals: processed.continuationSignals,
        candidates: processed.candidates,
        completion: processed.completion,
        selectedClue: processed.interpretations.find((item) => item.selected)?.selected?.value,
      });
      const stepOutcome =
        result.status === "error"
          ? {
              ...outcome,
              nextAction: this.recovery.suggest({
                errorText: [result.stderr, result.stdout].filter(Boolean).join("\n"),
                command,
                history,
                category: planSummary.category,
              }),
            }
          : outcome;
      tracker.finish(currentStep, result, stepOutcome);

      if (processed.continuationSignals.length && !processed.completion.completed) {
        this.emit(input, { type: "note", message: operationalMessage(input.language, "stage") });
      } else if (processed.candidates.length && !processed.completion.completed) {
        this.emit(input, { type: "note", message: operationalMessage(input.language, "intermediate") });
      }

      if (processed.completion.completed) {
        this.emit(input, { type: "status", status: processed.completion.status, stage: state.stage });
        break;
      }
      if (!continueUntilFlag) break;
    }

    const verifyStep = tracker.verify(stepIndex + 1, local ? "local-kali" : "remote-ctf");

    const previouslyVerified = Boolean(state.verifiedFlag);
    const finalCandidate = state.verifiedFlag || lastProcessed?.candidates[0]?.value || "";
    const finalVerification = this.verifier.verify(finalCandidate, {
      expectedFlag: state.expectedFlag,
      flagFormat: state.flagFormat,
      hintTexts: state.hints.flatMap((hint) => [hint.original, ...hint.interpretations.map((item) => item.value)]),
      terminalOutputs: state.commands.filter((item) => item.status === "ok").map((item) => item.stdout),
      historyOutputs: state.decodedMessages.map((item) => item.value),
      oracleAccepted: Boolean(state.verifiedFlag && state.verifiedFlag === finalCandidate),
      serverCompletionIndicators: state.successes,
      verificationAttempts: state.commands.length,
    });
    const completion = this.completionDetector.detect({
      verification: finalVerification,
      continuationSignals: state.unresolvedTasks,
      unresolvedTasks: state.unresolvedTasks,
      stage: state.stage,
      hintTexts: state.hints.map((item) => item.original),
      observationTexts: state.decodedMessages.map((item) => item.value),
    });
    const answerVerification = this.finalVerifier.verify({
      verification: finalVerification,
      completion,
      terminalOutputs: state.commands
        .filter((item) => item.status === "ok")
        .flatMap((item) => [item.stdout, item.stderr]),
      historyOutputs: state.decodedMessages.map((item) => item.value),
      stage: state.stage,
    });
    state.finalStatus = completion.status;
    if (finalVerification.status === "VERIFIED" && completion.flag) {
      state.verifiedFlag = completion.flag;
      if (!previouslyVerified) {
        this.emit(input, { type: "flag", flag: completion.flag, source: "expected" });
      }
    }
    let verifyStatus: ExecutionStepState = "FAILED";
    let verifyInterpretation = completion.reason;
    let verifyResult = finalVerification.reason;
    let verifyNextAction = "Periksa kembali bukti dan coba metode lain.";
    if (finalVerification.status === "VERIFIED") {
      verifyStatus = "COMPLETED";
      verifyInterpretation = "Flag diterima oleh oracle/server atau cocok dengan expectedFlag.";
      verifyResult = `Flag terverifikasi: ${completion.flag || state.verifiedFlag}`;
      verifyNextAction = "Selesai; laporkan flag tersebut.";
    } else if (completion.status === "POTENTIAL_FLAG" || completion.status === "INTERMEDIATE") {
      verifyStatus = "WAITING_FOR_INPUT";
      verifyInterpretation = "Kandidat ditemukan tetapi belum ada verifikasi server.";
      verifyNextAction = "Berikan petunjuk tambahan atau akses ke server untuk verifikasi.";
    }
    tracker.verified(verifyStep, verifyStatus, verifyInterpretation, verifyResult, verifyNextAction);
    this.emit(input, {
      type: "verification",
      verification: answerVerification,
      flag: completion.flag || state.verifiedFlag,
    });
    this.emit(input, { type: "status", status: completion.status, stage: state.stage });
    await this.memory.save(state);
    await this.persistVerification(input, answerVerification, completion.flag || state.verifiedFlag);

    const answer = this.responses.final({
      language: input.language,
      status: completion.status,
      flag: completion.flag || state.verifiedFlag,
      missing:
        completion.status === "UNSOLVED" && state.failures.length > 1
          ? [input.language === "id" ? "Petunjuk tambahan atau akses ke stage berikutnya" : "An additional hint or access to the next stage"]
          : undefined,
    });
    this.emit(input, { type: "done" });
    return {
      answer,
      status: completion.status,
      operation: local ? plan.operation : "SOLVE_UNTIL_FLAG",
      profileId: local ? undefined : profileId,
      stage: state.stage,
      verifiedFlag: completion.flag || state.verifiedFlag,
      answerVerification,
      connection: local ? undefined : await this.ssh.getStatus(input.sessionId),
    };
  }

  /** Explains a challenge strictly from persisted history, never from guesses. */
  private async explainSolution(
    plan: StructuredPlan,
    input: AutonomousRunInput,
    state: ChallengeStateRecord,
  ): Promise<AutonomousRunResult> {
    const challenge = input.challengeId ? await getChallenge(input.challengeId) : null;
    const records = await listVerificationRecords(input.sessionId);
    const latest = records[0];
    const steps = [
      ...state.originalInstructions.map((item) => `Instruksi awal: ${item}`),
      ...state.hints.map((item) => `Hint: ${item.meaning || item.original}`),
      ...state.decodedMessages.map((item) => `Dekode ${item.path.join(" → ") || item.source}: ${item.value}`),
      ...state.successes.map((item) => `Temuan: ${item}`),
      ...state.failures.slice(-2).map((item) => `Pendekatan gagal: ${item}`),
    ];
    const commands = state.commands.map((item) => item.command);
    const outputs = state.commands
      .filter((item) => item.status === "ok" && item.stdout.trim())
      .map((item) => item.stdout);
    const verification = latest
      ? `${latest.classification}${latest.confirmed ? "" : " (belum terverifikasi)"}: ${latest.reasons.join("; ")}`
      : state.verifiedFlag
        ? `Flag ${state.verifiedFlag} diterima sebagai bukti verifikasi tersimpan.`
        : "Belum ada catatan verifikasi tersimpan untuk challenge ini.";
    const answer = formatFinalReport({
      challengeName: challenge?.title || state.challengeId,
      status:
        state.finalStatus === "VERIFIED" || state.finalStatus === "COMPLETED"
          ? "Completed"
          : "Partially Completed",
      answer: state.verifiedFlag,
      steps,
      commands: commands.map((item) => redactTraceText(item)),
      outputs: outputs.map((item) => redactTraceText(item)),
      verification,
    });
    this.emit(input, { type: "note", message: "Penjelasan disusun dari perintah dan output yang tersimpan." });
    return {
      answer,
      status: state.finalStatus,
      operation: plan.operation,
      stage: state.stage,
      verifiedFlag: state.verifiedFlag,
    };
  }

  private async persistVerification(
    input: AutonomousRunInput,
    verification: AnswerVerification,
    candidate?: string,
  ) {
    try {
      await saveVerificationRecord({
        sessionId: input.sessionId,
        challengeId: input.challengeId,
        candidate,
        classification: verification.classification,
        confirmed: verification.confirmed,
        reasons: verification.reasons,
        evidence: verification.evidence,
      });
    } catch {
      // Persistence must never change the reported verification outcome.
    }
  }

  /** Re-checks a stored answer against existing evidence without new guesses. */
  private async verifyStoredAnswer(
    plan: StructuredPlan,
    input: AutonomousRunInput,
    state: ChallengeStateRecord,
  ): Promise<AutonomousRunResult> {
    const candidate =
      state.verifiedFlag ||
      state.decodedMessages.map((item) => item.value).find((value) => /\{[^}]+\}/.test(value)) ||
      "";
    const verification = this.verifier.verify(candidate, {
      expectedFlag: state.expectedFlag,
      flagFormat: state.flagFormat,
      hintTexts: state.hints.flatMap((hint) => [hint.original, ...hint.interpretations.map((item) => item.value)]),
      terminalOutputs: state.commands.filter((item) => item.status === "ok").map((item) => item.stdout),
      historyOutputs: state.decodedMessages.map((item) => item.value),
      oracleAccepted: Boolean(state.verifiedFlag && state.verifiedFlag === candidate),
      serverCompletionIndicators: state.successes,
      verificationAttempts: state.commands.length + 1,
    });
    const completion = this.completionDetector.detect({
      verification,
      continuationSignals: state.unresolvedTasks,
      unresolvedTasks: state.unresolvedTasks,
      stage: state.stage,
      hintTexts: state.hints.map((item) => item.original),
      observationTexts: state.decodedMessages.map((item) => item.value),
    });
    const answerVerification = this.finalVerifier.verify({
      verification,
      completion,
      terminalOutputs: state.commands.filter((item) => item.status === "ok").map((item) => item.stdout),
      historyOutputs: state.decodedMessages.map((item) => item.value),
      stage: state.stage,
    });
    state.finalStatus = completion.status;
    this.emit(input, {
      type: "verification",
      verification: answerVerification,
      flag: completion.flag || state.verifiedFlag,
    });
    this.emit(input, { type: "status", status: completion.status, stage: state.stage });
    await this.memory.save(state);
    await this.persistVerification(input, answerVerification, completion.flag || state.verifiedFlag);
    const answer = this.responses.final({
      language: input.language,
      status: completion.status,
      flag: completion.flag || state.verifiedFlag,
      note: answerVerification.confirmed ? undefined : `Verifikasi: ${answerVerification.classification}`,
    });
    return {
      answer,
      status: completion.status,
      operation: plan.operation,
      stage: state.stage,
      verifiedFlag: completion.flag || state.verifiedFlag,
      answerVerification,
    };
  }

  private async processOutput(
    result: CommandResult,
    state: ChallengeStateRecord,
    input: AutonomousRunInput,
  ): Promise<ProcessedOutput> {
    const reading = this.reader.read(result.stdout, result.stderr, result.environment);
    const commandSucceeded = result.status === "ok";
    // Error output (for example a refused SSH/git connection) often contains
    // hostnames or traceback fragments. Those are not challenge hints and must
    // never be decoded into flag candidates.
    const interpretations = commandSucceeded ? this.hints.interpret(reading, input.language) : [];
    for (const interpretation of interpretations) {
      this.memory.addHint(state, {
        id: interpretation.id,
        original: interpretation.original,
        source: interpretation.source,
        meaning: interpretation.meaning,
        interpretations: interpretation.interpretations,
        selected: interpretation.selected?.value,
        createdAt: new Date().toISOString(),
      });
      if (interpretation.selected) {
        this.emit(input, { type: "note", message: operationalMessage(input.language, "clue") });
      }
    }


    const terminalText = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const hintTexts = state.hints.flatMap((hint) => [hint.original, ...hint.interpretations.map((item) => item.value)]);
    // A failed command (for example a refused netcat connection) can contain
    // arbitrary text. Speculative decoding of that text produces many
    // flag-shaped artefacts, so only successful commands may seed candidates.
    if (commandSucceeded) {
      for (const source of [...reading.encodedCandidates, ...hintTexts]) {
        for (const attempt of this.hints.decode(source, hintTexts.join(" "), AUTONOMOUS_LIMITS.maxDecodeDepth)) {
          this.memory.addDecoded(state, attempt, source.slice(0, 200));
        }
      }
    }

    const decodedTexts = commandSucceeded ? state.decodedMessages.map((item) => item.value) : [];
    const rawCandidates = [
      ...extractFlagCandidates(commandSucceeded ? terminalText : "", "terminal-output", state.flagFormat),
      ...decodedTexts.flatMap((value) => extractFlagCandidates(value, "decoded-output", state.flagFormat)),
    ];
    const candidates = AdaptiveExecutionEngineHelpers.uniqueCandidates(rawCandidates).map((candidate) =>
      this.validator.validate({
        value: candidate.value,
        source: candidate.source,
        method: candidate.source.includes("decoded") ? "decoded" : "terminal",
        hintTexts,
        terminalOutputs: commandSucceeded ? [terminalText] : [],
        historyOutputs: decodedTexts,
        expectedFlag: state.expectedFlag,
        flagFormat: state.flagFormat,
      }),
    );
    const best = this.validator.select(candidates);
    const oracleFlag = commandSucceeded
      ? extractServerVerifiedFlag(
          [result.stdout],
          candidates.map((item) => item.value),
        )
      : undefined;
    const verification = this.verifier.verify(best || "", {
      expectedFlag: state.expectedFlag,
      flagFormat: state.flagFormat,
      hintTexts,
      terminalOutputs: commandSucceeded ? [terminalText] : [],
      historyOutputs: decodedTexts,
      oracleAccepted: Boolean(oracleFlag),
      serverCompletionIndicators: state.successes,
      verificationAttempts: AUTONOMOUS_LIMITS.maxVerificationAttempts,
    });
    if (oracleFlag) {
      state.verifiedFlag = oracleFlag;
      this.memory.addFinding(state, `Flag terverifikasi: ${oracleFlag}`);
      this.emit(input, { type: "flag", flag: oracleFlag, source: "server" });
    } else if (verification.status === "CONFLICTED") {
      this.memory.addFailure(state, `Kandidat flag ditolak: ${verification.candidate?.value || "tidak diketahui"}`);
    } else if (best) {
      this.memory.addFinding(state, `Kandidat flag ${best.value}: ${verification.status} (belum terverifikasi)`);
    }

    const continuationSignals = this.stages.detectContinuation(reading, interpretations);
    const completion = this.completionDetector.detect({
      verification,
      continuationSignals,
      unresolvedTasks: state.unresolvedTasks,
      stage: state.stage,
      hintTexts,
      observationTexts: decodedTexts,
    });
    if (commandSucceeded && reading.successIndicators.length) this.memory.addSuccess(state, reading.successIndicators[0]);
    if (reading.failureIndicators.length) this.memory.addFailure(state, reading.failureIndicators[0]);
    return { reading, interpretations, candidates, completion, continuationSignals };
  }

  private chooseLocalCommand(
    plan: StructuredPlan,
    state: ChallengeStateRecord,
    iteration: number,
    info: TerminalInfo | null,
    input: AutonomousRunInput,
    lastOutput: string,
  ): string | null {
    const operation = plan.operation;
    if (operation === "GIT_CLONE") {
      const { host, port, path } = plan.target || {};
      if (host && port !== undefined && path) {
        if (iteration === 0) {
          return this.commands.gitClone(host, port, plan.target?.username || "git", path);
        }
        const prefix = "cd /work/challenge 2>/dev/null || true; ";
        if (iteration === 1) return `${prefix}find . -maxdepth 3 -type f -print | head -n 120`;
        const decoded = this.chooseCommand(state, iteration);
        return decoded ? `${prefix}${decoded}` : null;
      }
    }
    if (operation === "NETCAT_CONNECT") {
      const target = netcatTarget(input.question);
      if (target) {
        if (iteration === 0) return this.commands.netcat(target.host, target.port);
        return null;
      }
    }
    const decoded = this.chooseCommand(state, iteration);
    if (decoded && /^(?:cat|ls|find|grep|head|tail|file|strings|xxd|hexdump|base64|base32|python3?|printf|echo|curl|openssl|jq)\b/i.test(decoded)) {
      return `cd /analysis 2>/dev/null || true; ${decoded}`;
    }
    if (!info) return decoded;
    const commands = buildPairedCommands({
      files: info.files,
      tools: info.tools,
      question: input.question,
      output: lastOutput,
      cycle: iteration,
    });
    return commands.length ? commands[iteration % commands.length] : decoded;
  }

  private chooseCommand(state: ChallengeStateRecord, iteration: number): string | null {
    for (const decoded of [...state.decodedMessages].reverse()) {
      const candidate = decoded.value.trim();
      if (
        candidate.length <= 500 &&
        /^(?:cat|ls|find|grep|head|tail|file|strings|xxd|hexdump|base64|base32|python3?|printf|echo|curl|openssl|jq)\b/i.test(
          candidate,
        )
      ) {
        return candidate;
      }
    }

    const sources = [
      ...state.originalInstructions,
      ...state.hints.flatMap((hint) => [hint.original, ...hint.interpretations.map((item) => item.value)]),
      ...state.decodedMessages.map((item) => item.value),
    ].join("\n");
    const filenames = [...new Set(
      [...sources.matchAll(/\b([A-Za-z0-9_.-]+\.(?:txt|json|csv|bin|dat|enc|log|md|png|jpg|jpeg|zip|gz|py|sh))\b/gi)].map(
        (match) => match[1],
      ),
    )].sort((left, right) => filenamePriority(right) - filenamePriority(left) || left.localeCompare(right));
    for (const filename of filenames.slice(0, 6)) {
      const quoted = shellQuote(filename);
      return `find . -maxdepth 4 -type f -name ${quoted} -print -exec sh -c 'for f do file "$f"; head -c 8192 "$f"; done' sh {} +`;
    }

    const fallbacks = [
      "pwd; ls -laR . | head -n 240",
      "find . -maxdepth 4 -type f -printf '%p %s bytes\\n' 2>/dev/null | head -n 160",
      "grep -RniE 'hint|clue|flag|stage|next|petunjuk|tahap|berikut' . 2>/dev/null | head -n 80",
    ];
    return fallbacks[iteration % fallbacks.length];
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Prefers files that a decoded hint explicitly points to for the next stage. */
function filenamePriority(value: string): number {
  const name = value.toLowerCase();
  let score = 0;
  if (/(?:stage|level|step|part|next|tahap|flag|key|secret|answer)/.test(name)) score += 5;
  if (/\d/.test(name)) score += 2;
  if (/(?:hint|petunjuk|clue|readme)/.test(name)) score += 1;
  if (/\.(?:txt|json|csv|bin|dat|enc|log|md)$/.test(name)) score += 1;
  return score;
}

function netcatTarget(question: string): { host: string; port: number } | null {
  const match = /(?:nc|netcat)\s+(\[[0-9A-Fa-f:]+\]|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost)(?:\s+(\d{1,5}))?/i.exec(question);
  if (!match) return null;
  const port = Number(match[2] || 23);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: match[1], port };
}

function canSolveLocally(operation: StructuredPlan["operation"], input: AutonomousRunInput): boolean {
  if (planHasLocalEnvironment(operation)) return true;
  return (
    [
      "SOLVE_UNTIL_FLAG",
      "CONTINUE_CHALLENGE",
      "DECODE_MESSAGE",
      "INVESTIGATE_NEXT_STAGE",
      "INSPECT_REMOTE",
      "READ_TERMINAL",
      "FOLLOW_HINT",
    ].includes(operation) &&
    (Boolean(input.fileIds?.length) || Boolean(input.challengeId))
  );
}

function planHasLocalEnvironment(operation: StructuredPlan["operation"]): boolean {
  return operation === "AUTO_ANALYZE" || operation === "NETCAT_CONNECT" || operation === "GIT_CLONE";
}

async function getProfileById(id: string) {
  const { getRemoteProfile } = await import("../store");
  return getRemoteProfile(id);
}

function profileAllowsStateChanges(profile: Awaited<ReturnType<typeof getProfileById>>): boolean {
  return Boolean(profile?.allowStateChanges);
}
