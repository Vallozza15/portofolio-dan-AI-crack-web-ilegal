export const INTENTS = [
  "NEW_QUESTION",
  "FOLLOW_UP",
  "CONTINUE_ANALYSIS",
  "REQUEST_ALTERNATIVE",
  "REQUEST_VERIFICATION",
  "REQUEST_EXPLANATION",
  "REQUEST_SHORT_ANSWER",
  "REQUEST_DETAILED_ANSWER",
  "CORRECTION",
  "REJECT_PREVIOUS_ANSWER",
  "NEW_CHALLENGE",
  "CLARIFICATION",
] as const;

export type Intent = (typeof INTENTS)[number];

export type ConfidenceLevel =
  | "CONFIRMED"
  | "HIGH_CONFIDENCE"
  | "PROBABLE"
  | "UNVERIFIED"
  | "INCORRECT";

export type HypothesisStatus = "open" | "testing" | "supported" | "rejected" | "confirmed";

export interface ContextSnapshot {
  sessionId: string;
  requestId: string;
  challengeId?: string;
  question: string;
  previousQuestions: string[];
  previousAnswers: string[];
  attemptedMethods: string[];
  failedApproaches: string[];
  confirmedFindings: string[];
  unresolvedQuestions: string[];
  challengeState: string;
  summaryText: string;
}

export interface HypothesisDraft {
  id: string;
  description: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  requiredTests: string[];
  confidence: number;
  status: HypothesisStatus;
}

export interface RepetitionAnalysis {
  similarity: number;
  repeatedAnswerIndexes: number[];
  duplicateCommands: string[];
  isUnnecessary: boolean;
  mustReferencePrevious: boolean;
  note: string;
}

export interface CrossValidationResult {
  agreements: Array<{ value: string; sources: string[] }>;
  conflicts: Array<{ value: string; sources: string[] }>;
  confidence: ConfidenceLevel;
  summary: string;
}

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  score: number;
  note: string;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface QualityReport {
  passed: boolean;
  checks: QualityCheck[];
  revised: boolean;
  answer: string;
}
