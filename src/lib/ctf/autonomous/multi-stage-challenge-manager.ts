import type { ChallengeContextMemory } from "./challenge-context-memory";
import type {
  ChallengeStateRecord,
  CompletionResult,
  HintInterpretation,
  OutputReading,
} from "./types";

/**
 * Persistent state machine for multi-stage challenges. It advances a stage
 * only when real output or a decoded message contains continuation evidence.
 */
export class MultiStageChallengeManager {
  constructor(private readonly memory: ChallengeContextMemory) {}

  async initialize(sessionId: string, challengeId?: string, instructions: string[] = []): Promise<ChallengeStateRecord> {
    const state = await this.memory.load(sessionId, challengeId);
    for (const instruction of instructions) {
      if (!state.originalInstructions.includes(instruction)) state.originalInstructions.push(instruction);
    }
    await this.memory.save(state);
    return state;
  }

  detectContinuation(reading: OutputReading, interpretations: HintInterpretation[]): string[] {
    const signals: string[] = [];
    for (const indicator of reading.stageIndicators) signals.push(indicator);
    for (const observation of reading.observations) {
      if (observation.kind === "instruction" || observation.kind === "hint") signals.push(observation.text);
      if (observation.kind === "encoded" && observation.confidence >= 0.5) signals.push(observation.text);
    }
    for (const interpretation of interpretations) {
      if (interpretation.selected) {
        const value = interpretation.selected.value;
        if (/\b(next|stage|lanjut|tahap|step|level|submit|kirim|then|after)\b/i.test(value)) {
          signals.push(value);
        }
      }
    }
    return [...new Set(signals.map((item) => item.slice(0, 500)))].slice(0, 20);
  }

  advance(
    state: ChallengeStateRecord,
    continuationSignals: string[],
    completion: CompletionResult,
  ): ChallengeStateRecord {
    if (!completion.completed && continuationSignals.length > 0) {
      const marker = continuationSignals[0];
      if (state.currentStageIndicator !== marker) {
        state.stage += 1;
        state.currentStageIndicator = marker;
        state.finalStatus = "INTERMEDIATE";
      }
      for (const signal of continuationSignals) this.memory.addUnresolved(state, signal);
    }
    state.finalStatus = completion.status;
    // Only the oracle verifier may promote a value to a verified flag. A
    // POTENTIAL candidate from speculative decoding must never be stored here,
    // otherwise the next iteration treats it as server evidence.
    return state;
  }

  shouldContinue(state: ChallengeStateRecord, completion: CompletionResult): boolean {
    return !completion.completed || state.unresolvedTasks.length > 0;
  }
}
