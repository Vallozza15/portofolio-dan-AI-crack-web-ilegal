import type {
  ConfidenceLevel,
  HypothesisStatus,
  Intent,
  QualityCheck,
} from "./reasoning/types";
import type {
  ChallengeStateRecord,
  RemoteAuditRecord,
  RemoteConnectionRecord,
  RemoteProfileRecord,
} from "./autonomous/types";

export type {
  ChallengeStateRecord,
  RemoteAuditRecord,
  RemoteConnectionRecord,
  RemoteProfileRecord,
} from "./autonomous/types";

export const CTF_CATEGORIES = [
  "cryptography",
  "forensics",
  "steganography",
  "web",
  "reverse",
  "binary",
  "osint",
  "misc",
] as const;

export type CtfCategory = (typeof CTF_CATEGORIES)[number];

export type Difficulty = "easy" | "medium" | "hard" | "insane" | "unknown";

export type VerificationStatus = "VERIFIED" | "LIKELY" | "INCOMPLETE" | "UNSOLVED";

export type SessionMode = "learning" | "expert" | "hint";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "compatible"
  | "local";

export interface Challenge {
  id: string;
  title: string;
  category: CtfCategory;
  description: string;
  difficulty: Difficulty;
  flagFormat: string;
  expectedFlag?: string;
  source?: string;
  status: VerificationStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredFile {
  id: string;
  name: string;
  originalName: string;
  extension: string;
  mime: string;
  size: number;
  sha256: string;
  md5: string;
  sha1: string;
  magic: string;
  storageName: string;
  createdAt: string;
  challengeId?: string;
  analysis?: FileAnalysis;
}

export interface EmbeddedFile {
  offset: number;
  signature: string;
  label: string;
  probableExtension: string;
}

export interface ArchiveEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compression: string;
  encrypted: boolean;
  crc32: string;
  preview?: string;
}

export interface ArchiveListing {
  format: string;
  entries: ArchiveEntry[];
  comment?: string;
  truncated: boolean;
}

export interface ImageInfo {
  format: string;
  width?: number;
  height?: number;
  bitDepth?: number;
  colorType?: string;
  channels?: number;
  frames?: number;
  chunks?: Array<{ type: string; length: number; text?: string }>;
  exif?: Record<string, string>;
  trailingBytes?: number;
  paletteEntries?: number;
}

export interface AudioInfo {
  format: string;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  durationSeconds?: number;
  chunks?: Array<{ id: string; size: number }>;
  trailingBytes?: number;
}

export interface SectionInfo {
  name: string;
  virtualAddress: string;
  virtualSize: number;
  rawOffset: number;
  rawSize: number;
  entropy: number;
  flags?: string;
}

export interface ImportInfo {
  library: string;
  functions: string[];
}

export interface SecurityFeature {
  name: string;
  enabled: boolean | null;
  detail: string;
}

export interface ExecutableInfo {
  format: "ELF" | "PE" | "Mach-O" | "unknown";
  architecture: string;
  bits: number;
  endianness?: string;
  entryPoint?: string;
  imageBase?: string;
  type?: string;
  sections: SectionInfo[];
  imports: ImportInfo[];
  symbols: string[];
  security: SecurityFeature[];
  packingHints: string[];
  gadgets?: Array<{ address: string; bytes: string; instruction: string }>;
}

export interface PcapSummary {
  format: string;
  linkType: string;
  packetCount: number;
  capturedBytes: number;
  protocols: Record<string, number>;
  conversations: Array<{ src: string; dst: string; protocol: string; packets: number }>;
  dnsQueries: string[];
  httpHosts: string[];
  httpRequests: string[];
  credentials: string[];
  interestingStrings: string[];
}

export interface PdfInfo {
  version: string;
  pages: number;
  producer?: string;
  creator?: string;
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
  hasOpenAction: boolean;
  objects: number;
  trailingBytes?: number;
}

export interface StegoFinding {
  technique: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  output?: string;
}

export interface FlagCandidate {
  value: string;
  format: string;
  source: string;
  confidence: number;
  context?: string;
}

export interface FileAnalysis {
  fileId: string;
  name: string;
  size: number;
  mime: string;
  magic: string;
  sha256: string;
  md5: string;
  sha1: string;
  entropy: number;
  categoryHints: CtfCategory[];
  strings: string[];
  stringCount: number;
  hexPreview: string;
  embedded: EmbeddedFile[];
  archive?: ArchiveListing;
  image?: ImageInfo;
  audio?: AudioInfo;
  executable?: ExecutableInfo;
  pcap?: PcapSummary;
  pdf?: PdfInfo;
  stego: StegoFinding[];
  flagCandidates: FlagCandidate[];
  warnings: string[];
  qr?: { found: boolean; data?: string; note: string };
  tags?: Record<string, string>;
  encodingLayers?: Array<{ operation: string; value: string }>;
  analyzedAt: string;
  durationMs: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  provider?: string;
  model?: string;
  mode?: SessionMode;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  evidenceIds?: string[];
  status?: VerificationStatus;
  requestId?: string;
  conversationId?: string;
}

export interface Session {
  id: string;
  challengeId?: string;
  title: string;
  mode: SessionMode;
  language: "id" | "en";
  provider: ProviderId;
  model: string;
  status: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  sessionId?: string;
  challengeId?: string;
  fileId?: string;
  kind: string;
  title: string;
  summary: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  createdAt: string;
}

export interface ToolRun {
  id: string;
  sessionId?: string;
  challengeId?: string;
  fileId?: string;
  requestId?: string;
  purpose?: string;
  hypothesisId?: string;
  phase?: string;
  exitCode?: number | null;
  artifacts?: Array<{ path: string; size: number }>;
  tool: string;
  args: string[];
  status: "ok" | "error" | "skipped" | "blocked";
  summary: string;
  durationMs: number;
  createdAt: string;
}

export interface FlagRecord {
  id: string;
  challengeId?: string;
  sessionId?: string;
  fileId?: string;
  value: string;
  format: string;
  source: string;
  confidence: number;
  status: VerificationStatus;
  evidenceIds: string[];
  createdAt: string;
}

export interface Report {
  id: string;
  challengeId?: string;
  sessionId?: string;
  title: string;
  category: CtfCategory;
  markdown: string;
  status: VerificationStatus;
  createdAt: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyEnc?: string;
  temperature: number;
  maxTokens: number;
}

export interface AiSettings {
  providers: ProviderConfig[];
  defaultProvider: ProviderId;
  fallbackOrder: ProviderId[];
  customInstructions: string;
}

export interface SystemSettings {
  defaultLanguage: "id" | "en";
  maxUploadMb: number;
  allowPrivateHttp: boolean;
  hostToolsEnabled: boolean;
  sandboxEnabled: boolean;
  retainDays: number;
}

export interface CtfSettings {
  ai: AiSettings;
  system: SystemSettings;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
}

/** Structured snapshot of what the solver knew before answering one request. */
export interface ReasoningContextRecord {
  id: string;
  sessionId: string;
  conversationId: string;
  challengeId?: string;
  requestId: string;
  messageId?: string;
  intent: Intent;
  question: string;
  previousQuestions: string[];
  previousAnswers: string[];
  attemptedMethods: string[];
  failedApproaches: string[];
  confirmedFindings: string[];
  unresolvedQuestions: string[];
  challengeState: string;
  summary: string;
  createdAt: string;
}

export interface IntentRecord {
  id: string;
  sessionId: string;
  challengeId?: string;
  requestId: string;
  intent: Intent;
  confidence: number;
  reason: string;
  createdAt: string;
}

export interface HypothesisRecord {
  id: string;
  sessionId: string;
  challengeId?: string;
  requestId: string;
  hypothesisId: string;
  description: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  requiredTests: string[];
  confidence: number;
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReasoningCheckRecord {
  id: string;
  sessionId: string;
  challengeId?: string;
  requestId: string;
  intent: Intent;
  confidence: ConfidenceLevel;
  score: number;
  agreements: string[];
  conflicts: string[];
  checks: QualityCheck[];
  passed: boolean;
  revised: boolean;
  note: string;
  createdAt: string;
}

/** Persisted authorized platform connection. Never contains raw tokens. */
export interface PlatformConnectionRecord {
  id: string;
  platform: string;
  platformName: string;
  officialUrl: string;
  authorization: "public" | "user-session";
  usedOfficialApi: boolean;
  sessionId?: string;
  tokenReference?: string;
  connectedAt: string;
  lastDiscoveryAt?: string;
  challengeCount: number;
  limitations: string[];
}

/** Persisted execution step evidence (the UI receives the same fields via stream). */
export interface ExecutionStepRecord {
  id: string;
  sessionId?: string;
  challengeId?: string;
  index: number;
  title: string;
  objective: string;
  command?: string;
  environment?: string;
  status: string;
  output?: string;
  interpretation?: string;
  result?: string;
  nextAction?: string;
  createdAt: string;
  updatedAt: string;
}

/** Persisted final-answer verification record. */
export interface VerificationRecordEntity {
  id: string;
  sessionId?: string;
  challengeId?: string;
  candidate?: string;
  classification: string;
  confirmed: boolean;
  reasons: string[];
  evidence: string[];
  createdAt: string;
}

export interface CtfDatabase {
  version: 1;
  challenges: Challenge[];
  files: StoredFile[];
  sessions: Session[];
  messages: Message[];
  evidence: Evidence[];
  toolRuns: ToolRun[];
  flags: FlagRecord[];
  reports: Report[];
  reasoningContexts: ReasoningContextRecord[];
  intents: IntentRecord[];
  hypotheses: HypothesisRecord[];
  reasoningChecks: ReasoningCheckRecord[];
  remoteProfiles: RemoteProfileRecord[];
  remoteConnections: RemoteConnectionRecord[];
  challengeStates: ChallengeStateRecord[];
  remoteAudit: RemoteAuditRecord[];
  platformConnections: PlatformConnectionRecord[];
  executionSteps: ExecutionStepRecord[];
  verificationRecords: VerificationRecordEntity[];
  settings: CtfSettings;
  audit: AuditLog[];
}

export interface PublicProviderConfig {
  id: ProviderId;
  label: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  hasKey: boolean;
  keySource: "saved" | "env" | "none";
  available: boolean;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  source: "saved" | "env" | "none";
  model: string;
  baseUrl: string;
  note: string;
}

export interface ToolStatus {
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  category: string;
  purpose: string;
  path?: string;
}

export interface DashboardData {
  totals: {
    challenges: number;
    solved: number;
    sessions: number;
    files: number;
    evidence: number;
    flags: number;
  };
  categories: Array<{ category: CtfCategory; count: number }>;
  recentChallenges: Challenge[];
  recentSessions: Array<Session & { challengeTitle?: string; messageCount: number }>;
  recentFlags: FlagRecord[];
  recentActivity: Array<{ id: string; label: string; detail: string; at: string; tone: "green" | "cyan" | "amber" | "rose" | "violet" }>;
  providerStatus: ProviderStatus[];
  toolStatus: ToolStatus[];
  storage: { dataDir: string; uploads: number; bytes: number };
  system: {
    authEnabled: boolean;
    sandboxEnabled: boolean;
    hostToolsEnabled: boolean;
    runtime: string;
    version: string;
  };
}

export interface AnalyzeTextResult {
  category: CtfCategory;
  categoryConfidence: number;
  keywords: string[];
  flagFormat: string;
  flagCandidates: FlagCandidate[];
  decodedLayers: Array<{ operation: string; value: string; flagCandidates: FlagCandidate[] }>;
  frequency: Array<{ char: string; count: number; percent: number }>;
  notes: string[];
  status: VerificationStatus;
}

export interface LocalAnalysisBundle {
  challenge: Challenge;
  files: FileAnalysis[];
  text: AnalyzeTextResult;
  evidence: Evidence[];
  flagCandidates: FlagCandidate[];
  toolRuns: ToolRun[];
  status: VerificationStatus;
  recommendedTools: string[];
  category: CtfCategory;
  title: string;
  summary: string;
}
