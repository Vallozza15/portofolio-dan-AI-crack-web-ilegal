/**
 * Structured contracts shared by every autonomous remote-CTF module.
 *
 * No module in this directory is allowed to import UI code or call an AI
 * provider directly. The orchestrator is the only entry point, and every
 * module communicates through the interfaces below.
 */

export type AutonomousLanguage = "id" | "en";

export type RemoteEnvironment = "local-kali" | "remote-ctf";

export type RemoteOperation =
  | "CONNECT_REMOTE"
  | "INSPECT_REMOTE"
  | "READ_TERMINAL"
  | "FOLLOW_HINT"
  | "CONTINUE_CHALLENGE"
  | "DECODE_MESSAGE"
  | "INVESTIGATE_NEXT_STAGE"
  | "SOLVE_UNTIL_FLAG"
  | "AUTO_ANALYZE"
  | "NETCAT_CONNECT"
  | "GIT_CLONE"
  | "STOP"
  | "DISCONNECT"
  | "CHECK_STATUS"
  | "VERIFY_ANSWER"
  | "EXPLAIN_SOLUTION"
  | "SAVE_PROFILE"
  | "GENERAL_QUESTION"
  | "REQUEST_REPORT";

export type RemoteAuthMethod = "password" | "privateKey" | "agent";

export type RemoteConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "stopped";

export type ChallengeFinalStatus =
  | "UNSOLVED"
  | "INTERMEDIATE"
  | "POTENTIAL_FLAG"
  | "VERIFIED"
  | "COMPLETED";

/** Answer-level vocabulary required by the final-answer verification engine. */
export type AnswerConfidence =
  | "CONFIRMED"
  | "HIGH CONFIDENCE"
  | "PROBABLE"
  | "UNVERIFIED"
  | "REJECTED";

export interface AnswerVerification {
  classification: AnswerConfidence;
  confirmed: boolean;
  reasons: string[];
  evidence: string[];
}

export type CommandRisk = "read-only" | "analysis" | "state-changing" | "blocked";

/** Metadata only. Secrets are stored in dedicated encrypted fields. */
export interface RemoteProfileRecord {
  id: string;
  sessionId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: RemoteAuthMethod;
  hostKeyFingerprint: string;
  challengeId?: string;
  remoteCwd?: string;
  timeoutMs: number;
  allowStateChanges: boolean;
  authorized: boolean;
  passwordEnc?: string;
  privateKeyEnc?: string;
  passphraseEnc?: string;
  status: RemoteConnectionStatus;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}

export interface PublicRemoteProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: RemoteAuthMethod;
  hostKeyFingerprint: string;
  challengeId?: string;
  remoteCwd?: string;
  timeoutMs: number;
  allowStateChanges: boolean;
  authorized: boolean;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
  status: RemoteConnectionStatus;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}

export interface RemoteConnectionRecord {
  id: string;
  sessionId: string;
  profileId: string;
  host: string;
  username: string;
  status: RemoteConnectionStatus;
  cwd: string;
  lastCommand?: string;
  lastExitCode?: number | null;
  connectedAt?: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ChallengeHintRecord {
  id: string;
  original: string;
  source: string;
  meaning: string;
  interpretations: Array<{
    method: string;
    value: string;
    score: number;
    evidence: string;
  }>;
  selected?: string;
  createdAt: string;
}

export interface CommandHistoryRecord {
  id: string;
  environment: RemoteEnvironment;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: "ok" | "error" | "blocked";
  purpose: string;
  cwd: string;
  createdAt: string;
}

export interface ChallengeStateRecord {
  id: string;
  sessionId: string;
  challengeId?: string;
  stage: number;
  originalInstructions: string[];
  hints: ChallengeHintRecord[];
  decodedMessages: Array<{ value: string; path: string[]; source: string; createdAt: string }>;
  commands: CommandHistoryRecord[];
  failures: string[];
  successes: string[];
  currentStageIndicator: string;
  confirmedFindings: string[];
  unresolvedTasks: string[];
  finalStatus: ChallengeFinalStatus;
  verifiedFlag?: string;
  expectedFlag?: string;
  flagFormat?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteAuditRecord {
  id: string;
  sessionId: string;
  profileId?: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface StructuredPlan {
  operation: RemoteOperation;
  confidence: number;
  reason: string;
  target?: {
    profileId?: string;
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    authMethod?: RemoteAuthMethod;
    fingerprint?: string;
    remoteCwd?: string;
    challengeId?: string;
    path?: string;
  };
  requirements: string[];
  session: {
    sessionId: string;
    challengeId?: string;
    environment: RemoteEnvironment;
  };
  permissions: {
    stateChange: boolean;
    reason?: string;
  };
  expectedResult: string;
  missing: string[];
  extractedSecrets?: Array<{
    field: "password" | "privateKey" | "passphrase";
    value: string;
  }>;
  redactedQuestion: string;
}

export interface InterpretationInput {
  question: string;
  sessionId: string;
  challengeId?: string;
  language: AutonomousLanguage;
  activeProfileId?: string;
}

export interface RepetitionCheck {
  repeated: boolean;
  normalized: string;
  reason: string;
}

export interface ConnectionSecrets {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ConnectionStatusView {
  profileId: string;
  environment: "remote-ctf";
  status: RemoteConnectionStatus;
  host: string;
  username: string;
  cwd: string;
  lastCommand?: string;
  lastExitCode?: number | null;
  note: string;
  connectedAt?: string;
}

export interface CommandResult {
  commandId: string;
  environment: RemoteEnvironment;
  command: string;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number | null;
  status: "ok" | "error" | "blocked";
  cwd: string;
  durationMs: number;
  artifacts: Array<{ path: string; size: number }>;
  note: string;
}

export interface ExecutionRequest {
  command: string;
  purpose: string;
  environment: RemoteEnvironment;
  timeoutMs?: number;
  allowStateChange?: boolean;
  requestId?: string;
}

export interface CommandValidation {
  ok: boolean;
  risk: CommandRisk;
  reason: string;
  requiresAuthorization: boolean;
}

export interface EndpointAuthorization {
  ok: boolean;
  reason: string;
}

export interface TerminalObservation {
  id: string;
  kind:
    | "instruction"
    | "hint"
    | "encoded"
    | "file"
    | "permission"
    | "stage"
    | "success"
    | "failure"
    | "error"
    | "path"
    | "plain";
  text: string;
  source: "stdout" | "stderr" | "decoded";
  confidence: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface OutputReading {
  raw: string;
  stdout: string;
  stderr: string;
  observations: TerminalObservation[];
  encodedCandidates: string[];
  paths: string[];
  stageIndicators: string[];
  successIndicators: string[];
  failureIndicators: string[];
}

export interface DecodingAttempt {
  method: string;
  value: string;
  path: string[];
  score: number;
  evidence: string;
}

export interface HintInterpretation {
  id: string;
  original: string;
  source: string;
  meaning: string;
  interpretations: DecodingAttempt[];
  selected?: DecodingAttempt;
  rejected: string[];
}

export interface CandidateSolution {
  id: string;
  value: string;
  source: string;
  method: string;
  hintAlignment: number;
  terminalSupport: number;
  historySupport: number;
  formatScore: number;
  oracleMatch: boolean;
  score: number;
}

export interface VerificationContext {
  expectedFlag?: string;
  flagFormat?: string;
  hintTexts: string[];
  terminalOutputs: string[];
  historyOutputs: string[];
  oracleAccepted?: boolean;
  serverCompletionIndicators: string[];
  verificationAttempts: number;
}

export interface CompletionContext {
  verification: VerificationResult;
  continuationSignals: string[];
  unresolvedTasks: string[];
  stage: number;
  hintTexts: string[];
  observationTexts: string[];
}

export interface VerificationResult {
  status: "UNVERIFIED" | "POTENTIAL" | "VERIFIED" | "CONFLICTED";
  candidate?: CandidateSolution;
  reason: string;
  evidence: string[];
}

export interface CompletionResult {
  status: ChallengeFinalStatus;
  completed: boolean;
  reason: string;
  continuationSignals: string[];
  flag?: string;
}

export type ExecutionStepState =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "VERIFYING"
  | "WAITING_FOR_INPUT";

export interface ExecutionStep {
  id: string;
  index: number;
  title: string;
  objective: string;
  reason?: string;
  expected?: string;
  command: string;
  environment: RemoteEnvironment;
  status: ExecutionStepState;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  output?: string;
  interpretation?: string;
  result?: string;
  nextAction?: string;
  exitCode?: number | null;
  durationMs?: number;
  artifacts?: Array<{ path: string; size: number }>;
}

export type OrchestratorEvent =
  | { type: "note"; message: string }
  | { type: "delta"; text: string }
  | { type: "status"; status: ChallengeFinalStatus; stage: number }
  | {
      type: "execution-plan";
      category: string;
      strategy: string;
      environment: RemoteEnvironment;
      operation: RemoteOperation;
    }
  | { type: "step"; step: ExecutionStep }
  | { type: "command"; commandId: string; stepId?: string; command: string; phase?: string }
  | {
      type: "output";
      commandId: string;
      stepId?: string;
      command: string;
      phase?: string;
      cwd?: string;
      stdout?: string;
      stderr?: string;
      output?: string;
      status?: string;
      exitCode?: number | null;
      durationMs?: number;
      artifacts?: Array<{ path: string; size: number }>;
    }
  | { type: "flag"; flag: string; source: "server" | "expected" }
  | { type: "verification"; verification: AnswerVerification; flag?: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AutonomousRunInput {
  sessionId: string;
  challengeId?: string;
  question: string;
  requestId: string;
  fileIds?: string[];
  language: AutonomousLanguage;
  signal?: AbortSignal;
  onEvent?: (event: OrchestratorEvent) => void;
}

export interface AutonomousRunResult {
  answer: string;
  status: ChallengeFinalStatus;
  operation: RemoteOperation;
  profileId?: string;
  stage: number;
  verifiedFlag?: string;
  connection?: ConnectionStatusView;
  answerVerification?: AnswerVerification;
}

export interface RemoteProfileInput {
  sessionId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: RemoteAuthMethod;
  hostKeyFingerprint: string;
  challengeId?: string;
  remoteCwd?: string;
  timeoutMs?: number;
  allowStateChanges?: boolean;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}
