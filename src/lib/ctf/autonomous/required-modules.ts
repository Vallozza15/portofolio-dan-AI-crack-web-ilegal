/**
 * Named integrations for the required CTF software modules.
 *
 * These classes are thin, wired adapters over the existing battle-tested
 * implementations. They are instantiated by AdaptiveExecutionEngine (or its
 * orchestrator), so they are live modules rather than disconnected stubs.
 */
import { ChallengeContextMemory } from "./challenge-context-memory";
import { categoryLabel, classifyChallenge } from "./challenge-category";
import {
  understandChallenge,
  understandingToClassification,
  type ChallengeUnderstandingInput,
} from "./universal-understanding";
import { ChallengeCompletionDetector } from "./challenge-completion-detector";
import { ChallengeHintInterpreter } from "./challenge-hint-interpreter";
import { EncodingDetectionEngine } from "./encoding-detection-engine";
import { ErrorRecoveryManager } from "./error-recovery-manager";
import { HypothesisReasoningEngine } from "./hypothesis-reasoning-engine";
import { FinalAnswerVerifier } from "./final-answer-verifier";
import { buildGitCloneCommand } from "./git-clone-challenge";
import { LocalKaliTerminalManager } from "./local-kali-terminal-manager";
import { buildPairedCommands } from "./tool-pairing";
import { MultiStageChallengeManager } from "./multi-stage-challenge-manager";
import { MultiStrategyValidator } from "./multi-strategy-validator";
import { buildNetcatSolverCommand } from "./netcat-challenge-solver";
import { RemoteTerminalManager } from "./remote-terminal-manager";
import { StepProgressTracker } from "./step-progress-tracker";
import { TerminalOutputReader } from "./terminal-output-reader";
import { FlagVerificationEngine } from "./flag-verification-engine";
import type {
  ChallengeStateRecord,
  CompletionResult,
  ExecutionRequest,
  ExecutionStepState,
  RemoteEnvironment,
  StructuredPlan,
} from "./types";

export { ChallengeCompletionDetector, ErrorRecoveryManager, FinalAnswerVerifier, StepProgressTracker };

export class CTFChallengeClassifier {
  /** Evidence-based classification across all available challenge channels. */
  understand(input: ChallengeUnderstandingInput) {
    return understandChallenge(input);
  }

  /** Backwards-compatible single-text classification backed by evidence scoring. */
  classify(text: string) {
    if (!text.trim()) {
      const result = classifyChallenge(text);
      return { ...result, label: categoryLabel(result.category) };
    }
    const understanding = understandChallenge({ description: text });
    const result = understandingToClassification(understanding);
    return {
      category: result.category,
      confidence: result.confidence,
      strategy: result.strategy,
      label: result.label,
      evidence: result.evidence,
      missingInformation: result.missingInformation,
    };
  }
}

export class ChallengeContextManager {
  readonly memory = new ChallengeContextMemory();
  readonly stages = new MultiStageChallengeManager(this.memory);

  initialize(sessionId: string, challengeId?: string, instructions: string[] = []) {
    return this.stages.initialize(sessionId, challengeId, instructions);
  }

  save(state: ChallengeStateRecord) {
    return this.memory.save(state);
  }

  advance(state: ChallengeStateRecord, signals: string[], completion: CompletionResult) {
    return this.stages.advance(state, signals, completion);
  }
}

export class ExecutionPlanGenerator {
  private readonly hypotheses = new HypothesisReasoningEngine();

  constructor(private readonly classifier = new CTFChallengeClassifier()) {}

  summarize(plan: StructuredPlan, text: string, environment: RemoteEnvironment) {
    const understanding = this.classifier.understand({ description: text });
    const classification = understandingToClassification(understanding);
    return {
      category: classification.label,
      strategy:
        classification.strategy ||
        "Kumpulkan bukti awal dari file/perintah, lalu pilih metode berdasarkan output nyata.",
      environment,
      operation: plan.operation,
      hypotheses: this.hypotheses.build(understanding).slice(0, 5),
      missingInformation: understanding.missingInformation,
    };
  }
}

export class KaliCommandGenerator {
  gitClone(host: string, port: number, username: string, path: string): string {
    return buildGitCloneCommand({ host, port, username, path });
  }

  netcat(host: string, port: number): string {
    return buildNetcatSolverCommand(host, port);
  }

  paired(input: Parameters<typeof buildPairedCommands>[0]): string[] {
    return buildPairedCommands(input);
  }
}

export class TerminalExecutionManager {
  private readonly local = new LocalKaliTerminalManager();
  private readonly remote = new RemoteTerminalManager();

  prepare(sessionId: string, fileIds?: string[]) {
    return this.local.prepareWithInfo(sessionId, fileIds);
  }

  execute(sessionId: string, environment: RemoteEnvironment, request: ExecutionRequest) {
    return environment === "local-kali"
      ? this.local.execute(sessionId, request)
      : this.remote.execute(sessionId, request);
  }

  inspect(sessionId: string) {
    return this.remote.inspect(sessionId);
  }

  readTerminal(sessionId: string) {
    return this.remote.readTerminal(sessionId);
  }
}

export class LiveOutputReader extends TerminalOutputReader {}

export class HintInterpretationEngine {
  private readonly encoder = new EncodingDetectionEngine();
  private readonly interpreter = new ChallengeHintInterpreter(this.encoder);

  decode(value: string, hints: string, depth: number) {
    return this.encoder.decode(value, hints, depth);
  }

  interpret(reading: ReturnType<TerminalOutputReader["read"]>, language: "id" | "en") {
    return this.interpreter.interpret(reading, language);
  }
}

export class MultiMethodValidator {
  private readonly strategies = new MultiStrategyValidator();
  private readonly flags = new FlagVerificationEngine();

  validate(input: Parameters<MultiStrategyValidator["validate"]>[0]) {
    return this.strategies.validate(input);
  }

  select(candidates: Parameters<MultiStrategyValidator["select"]>[0]) {
    return this.strategies.select(candidates);
  }

  verifyFlag(
    candidate: Parameters<FlagVerificationEngine["verify"]>[0],
    context: Parameters<FlagVerificationEngine["verify"]>[1],
  ) {
    return this.flags.verify(candidate, context);
  }
}

export type { ExecutionStepState };
