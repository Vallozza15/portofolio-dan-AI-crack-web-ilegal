import { AdaptiveExecutionEngine } from "./adaptive-execution-engine";
import { NaturalLanguageCommandInterpreter } from "./natural-language-command-interpreter";
import type {
  AutonomousRunInput,
  AutonomousRunResult,
  InterpretationInput,
  StructuredPlan,
} from "./types";

/**
 * Single entry point that connects the natural-language interpreter with the
 * adaptive executor. All modules stay behind this façade; no route or UI ever
 * imports an individual module directly.
 */
export class AutonomousOrchestrator {
  private readonly interpreter = new NaturalLanguageCommandInterpreter();
  private readonly engine = new AdaptiveExecutionEngine();

  interpret(input: InterpretationInput): StructuredPlan {
    return this.interpreter.interpret(input);
  }

  async run(plan: StructuredPlan, input: AutonomousRunInput): Promise<AutonomousRunResult> {
    return this.engine.run(plan, input);
  }

  /**
   * Convenience wrapper used by the chat route. Returns both the result and
   * the plan so the caller can decide whether to fall back to normal AI for
   * general questions or detailed report requests.
   */
  async execute(input: AutonomousRunInput): Promise<{ plan: StructuredPlan; result: AutonomousRunResult }> {
    const plan = this.interpret({
      question: input.question,
      sessionId: input.sessionId,
      challengeId: input.challengeId,
      language: input.language,
      activeProfileId: undefined,
    });
    const result = await this.run(plan, input);
    return { plan, result };
  }
}

export const autonomousOrchestrator = new AutonomousOrchestrator();
