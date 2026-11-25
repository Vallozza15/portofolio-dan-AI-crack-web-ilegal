/**
 * Contracts for authorized CTF platform discovery.
 *
 * Nothing in this layer executes a challenge or submits an answer unless the
 * caller explicitly authorizes it. All network access is constrained to the
 * official host of the selected adapter.
 */
export type PlatformId =
  | "ctfd"
  | "picoctf"
  | "overthewire"
  | "root-me"
  | "hackthebox-academy"
  | "tryhackme"
  | "portswigger-academy"
  | "cryptohack"
  | "cyberdefenders";

export type PlatformAuthorization = "public" | "user-session";

export interface PlatformChallenge {
  id: string;
  title: string;
  url: string;
  description?: string;
  categories?: string[];
  difficulty?: string;
  artifacts?: string[];
  hints?: string[];
  flagFormat?: string;
  submissionRequirements?: string;
  officialApi: boolean;
}

export interface PlatformDiscoveryResult {
  platform: PlatformId;
  platformName: string;
  officialUrl: string;
  authorization: PlatformAuthorization;
  usedOfficialApi: boolean;
  challenges: PlatformChallenge[];
  limitations: string[];
  retrievedAt: string;
}

export interface PlatformChallengeResult {
  platform: PlatformId;
  challenge: PlatformChallenge;
  limitations: string[];
}

export interface PlatformArtifactResult {
  platform: PlatformId;
  url: string;
  filename: string;
  mimeType?: string;
  bytes: Uint8Array;
}

export interface PlatformSubmissionResult {
  platform: PlatformId;
  challengeId: string;
  accepted: boolean;
  message: string;
}

export interface PlatformRequestContext {
  /** Explicit operator authorization. Without this, no network call is made. */
  authorized: boolean;
  /** Authorization mode; user-session requires credentials supplied by the user. */
  authorization: PlatformAuthorization;
  /** Official API token supplied by the operator, never read from process.env. */
  token?: string;
  /** Operator-supplied session cookie for authenticated challenge pages. */
  sessionCookie?: string;
  /** Operator-provided base URL for a specific instance of the platform. */
  officialBaseUrl?: string;
  timeoutMs?: number;
  maxChallenges?: number;
  maxBytes?: number;
  /** For local authorized training fixtures only. Never enable for the public internet. */
  allowLocalEndpoints?: boolean;
  /** Required before any external answer submission. */
  allowSubmission?: boolean;
  fetcher?: typeof fetch;
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly name: string;
  readonly officialUrl: string;
  readonly supportsOfficialApi: boolean;
  readonly requiresUserSession: boolean;
  readonly capabilities: Array<"discover" | "read" | "download" | "submit">;
  discover(context: PlatformRequestContext): Promise<PlatformDiscoveryResult>;
  getChallenge(id: string, context: PlatformRequestContext): Promise<PlatformChallengeResult>;
  downloadArtifact(url: string, context: PlatformRequestContext): Promise<PlatformArtifactResult>;
  submitAnswer(
    challengeId: string,
    answer: string,
    context: PlatformRequestContext,
  ): Promise<PlatformSubmissionResult>;
}

export class PlatformAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformAuthorizationError";
  }
}
