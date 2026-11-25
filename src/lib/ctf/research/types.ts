/** Types for public write-up discovery. No secret is ever stored in these records. */

export type ResearchStatus =
  | "VERIFIED"
  | "MULTI-SOURCE CONFIRMED"
  | "SOURCE CONFIRMED"
  | "HIGH CONFIDENCE"
  | "CONFLICTING"
  | "UNVERIFIED";

export type ResearchProvider = "github" | "brave" | "googleCse" | "operator";

export interface ChallengeIdentity {
  challenge_title: string;
  normalized_title: string;
  platform: string;
  event: string;
  year: string;
  category: string;
  challenge_url: string;
  flag_format: string;
  identity_confidence: string;
  title_variants: string[];
  ambiguous: boolean;
  /** Internal matching hints, derived only from operator input. */
  description_tokens: string[];
  artifact_tokens: string[];
  flag_prefix: string;
  notes: string[];
}

export interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
  provider: ResearchProvider;
  kind: "repository" | "gist" | "issue" | "web";
  author?: string;
  repository?: string;
  publishedAt?: string;
  rawUrl?: string;
  rawContent?: string;
}

export interface SourceMatch {
  score: number;
  tier: "exact" | "strong" | "potential" | "insufficient";
  reasons: string[];
  breakdown: Record<string, number>;
}

export interface DiscoveredFlag {
  value: string;
  format: string;
  confidence: number;
  context?: string;
}

export interface ResearchSource {
  url: string;
  finalUrl: string;
  title: string;
  author: string;
  platform: string;
  challengeName: string;
  description: string;
  methodology: string[];
  codeSnippets: string[];
  candidateFlags: DiscoveredFlag[];
  priority: 1 | 2 | 3;
  accessible: boolean;
  retrievedAt: string;
  statusCode?: number;
  provider: ResearchProvider;
  kind: SearchResultItem["kind"];
  match: SourceMatch | null;
  untrustedNotice: string;
  instructionLikeContent: boolean;
  error?: string;
}

export interface ResearchCandidate {
  value: string;
  sources: string[];
  exactSources: string[];
  independentProvenance: string[];
  highestConfidence: number;
  officialValidated: boolean;
}

export interface OfficialValidation {
  flag: string;
  evidence: string;
}

export interface CrossValidationResult {
  status: ResearchStatus;
  answer: string;
  candidates: ResearchCandidate[];
  reasons: string[];
  verification: string;
}

export interface ResearchFinalAnswer {
  challenge: string;
  platform: string;
  answer: string;
  status: ResearchStatus;
  discoveryMethod: "Public Write-up Discovery" | "Independent Autonomous Solving";
  solution: string[];
  source: string;
  additionalSources: string[];
  verification: string;
  formatted: string;
}

export type ResearchEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "identity"; identity: ChallengeIdentity }
  | { type: "query"; query: string; provider: ResearchProvider }
  | { type: "provider"; provider: ResearchProvider; status: "ok" | "skipped" | "error"; count: number; message: string }
  | { type: "source"; url: string; title: string; retrieved: boolean; score: number; tier: string; candidateCount: number }
  | { type: "candidate"; value: string; sources: number; exactSources: number }
  | { type: "status"; status: ResearchStatus }
  | { type: "answer"; answer: ResearchFinalAnswer }
  | { type: "fallback"; reason: string; challenge: { title: string; platform: string; description: string } }
  | { type: "solver-event"; event: Record<string, unknown> }
  | { type: "solver-answer"; answer: string; status: ResearchStatus; note: string }
  | { type: "error"; message: string }
  | { type: "done"; sessionId: string };

export interface ResearchSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: {
    title: string;
    platform: string;
    category: string;
    url: string;
    description: string;
    seedUrls?: string[];
  };
  identity: ChallengeIdentity;
  queries: string[];
  results: SearchResultItem[];
  sources: ResearchSource[];
  candidates: ResearchCandidate[];
  status: ResearchStatus;
  answer: ResearchFinalAnswer | null;
  fallbackReason: string;
  events: ResearchEvent[];
}

export interface ResearchApiConfig {
  provider: ResearchProvider;
  enabled: boolean;
  apiKey?: string;
  cx?: string;
  githubToken?: string;
}

export interface PublicResearchSettings {
  provider: ResearchProvider;
  enabled: boolean;
  hasKey: boolean;
  hasGithubToken: boolean;
  cx: string;
}

export interface ResearchSettingsPatch {
  provider?: ResearchProvider;
  enabled?: boolean;
  apiKey?: string;
  githubToken?: string;
  cx?: string;
  clearKey?: boolean;
  clearGithubToken?: boolean;
}
