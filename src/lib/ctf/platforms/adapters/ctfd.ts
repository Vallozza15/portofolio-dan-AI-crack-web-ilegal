import { authorizedFetch, authorizedFetchBytes } from "../authorized-fetch";
import {
  PlatformAuthorizationError,
  type PlatformAdapter,
  type PlatformArtifactResult,
  type PlatformChallenge,
  type PlatformChallengeResult,
  type PlatformDiscoveryResult,
  type PlatformRequestContext,
  type PlatformSubmissionResult,
} from "../types";

const OFFICIAL_URL = "https://ctfd.io";

interface CtfdListResponse {
  success?: boolean;
  data?: Array<{ id?: number | string; name?: string; category?: string; value?: number | string }>;
}

interface CtfdDetailResponse {
  success?: boolean;
  data?: {
    id?: number | string;
    name?: string;
    description?: string;
    category?: string;
    files?: Array<string | { name?: string; url?: string }>;
    hints?: Array<{ content?: string; preview?: string; cost?: number }>;
  };
}

function apiUrl(base: string, path: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function artifactUrls(
  challengeUrl: string,
  files: Array<string | { name?: string; url?: string }> | undefined,
): string[] {
  if (!files) return [];
  return files
    .map((file) => (typeof file === "string" ? file : file?.url))
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value, challengeUrl).toString());
}

/** CTFd official REST API adapter. Token and base URL are supplied by the operator. */
export class CtfdPlatformAdapter implements PlatformAdapter {
  readonly id = "ctfd" as const;
  readonly name = "CTFd";
  readonly officialUrl = OFFICIAL_URL;
  readonly supportsOfficialApi = true;
  readonly requiresUserSession = true;
  readonly capabilities: Array<"discover" | "read" | "download" | "submit"> = [
    "discover",
    "read",
    "download",
    "submit",
  ];

  discover(context: PlatformRequestContext): Promise<PlatformDiscoveryResult> {
    return this.discoverFrom(context.officialBaseUrl || OFFICIAL_URL, context);
  }

  private async discoverFrom(base: string, context: PlatformRequestContext): Promise<PlatformDiscoveryResult> {
    if (!context.token) {
      return {
        platform: this.id,
        platformName: this.name,
        officialUrl: base,
        authorization: context.authorization,
        usedOfficialApi: false,
        challenges: [],
        limitations: ["CTFd API memerlukan token yang diberikan pengguna; tidak ada pengeboran login."],
        retrievedAt: new Date().toISOString(),
      };
    }
    const listUrl = apiUrl(base, "/api/v1/challenges");
    const response = await authorizedFetch(listUrl, base, context);
    if (!response.text.trim().startsWith("{")) {
      throw new PlatformAuthorizationError("Respons CTFd bukan JSON; autentikasi mungkin diperlukan.");
    }
    const parsed = JSON.parse(response.text) as CtfdListResponse;
    if (response.status >= 400 || parsed.success === false || !Array.isArray(parsed.data)) {
      throw new PlatformAuthorizationError(`CTFd menolak permintaan (HTTP ${response.status}).`);
    }
    const limit = Math.min(context.maxChallenges || 20, 100);
    const challenges: PlatformChallenge[] = [];
    for (const item of parsed.data.slice(0, limit)) {
      if (item.id === undefined || item.id === null) continue;
      const detailUrl = apiUrl(base, `/api/v1/challenges/${encodeURIComponent(String(item.id))}`);
      const detailResponse = await authorizedFetch(detailUrl, base, context);
      let detail: CtfdDetailResponse = {};
      try {
        detail = JSON.parse(detailResponse.text) as CtfdDetailResponse;
      } catch {
        detail = {};
      }
      const data = detail.data;
      const rawFiles = data?.files;
      const files = Array.isArray(rawFiles) ? rawFiles : [];
      const hints = Array.isArray(data?.hints)
        ? data.hints
            .filter((hint) => typeof hint?.content === "string" && !hint.cost)
            .map((hint) => String(hint.content))
        : [];
      challenges.push({
        id: String(item.id),
        title: String(data?.name || item.name || `challenge-${item.id}`),
        url: detailUrl,
        description: data?.description,
        categories: [data?.category || item.category || "unknown"].filter(Boolean) as string[],
        difficulty: item.value === undefined ? undefined : String(item.value),
        artifacts: artifactUrls(detailUrl, files),
        hints,
        officialApi: true,
      });
    }
    return {
      platform: this.id,
      platformName: this.name,
      officialUrl: base,
      authorization: context.authorization,
      usedOfficialApi: true,
      challenges,
      limitations: [
        "Hanya tantangan yang terlihat oleh token pengguna yang dikembalikan.",
        "Hint berbayar/tidak terbuka tidak diambil.",
        "Pengiriman jawaban tidak pernah dilakukan otomatis.",
      ],
      retrievedAt: new Date().toISOString(),
    };
  }

  async getChallenge(id: string, context: PlatformRequestContext): Promise<PlatformChallengeResult> {
    const base = context.officialBaseUrl || OFFICIAL_URL;
    const result = await this.discoverFrom(base, context);
    const challenge = result.challenges.find((item) => item.id === id);
    if (!challenge) throw new PlatformAuthorizationError("Challenge tidak ditemukan atau tidak terlihat oleh token.");
    return { platform: this.id, challenge, limitations: result.limitations };
  }

  async downloadArtifact(url: string, context: PlatformRequestContext): Promise<PlatformArtifactResult> {
    const base = context.officialBaseUrl || OFFICIAL_URL;
    const result = await authorizedFetchBytes(url, base, context);
    const filename = new URL(result.url).pathname.split("/").filter(Boolean).pop() || "artifact.bin";
    return {
      platform: this.id,
      url: result.url,
      filename,
      mimeType: result.contentType,
      bytes: result.bytes,
    };
  }

  async submitAnswer(
    challengeId: string,
    answer: string,
    context: PlatformRequestContext,
  ): Promise<PlatformSubmissionResult> {
    if (!context.allowSubmission) {
      throw new PlatformAuthorizationError("Pengiriman jawaban memerlukan izin eksplisit allowSubmission=true.");
    }
    const base = context.officialBaseUrl || OFFICIAL_URL;
    const url = apiUrl(base, "/api/v1/challenges/attempt");
    const response = await authorizedFetch(url, base, context, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge_id: challengeId, flag: answer }),
    });
    let parsed: { success?: boolean; data?: { status?: string; message?: string } } = {};
    try {
      parsed = JSON.parse(response.text);
    } catch {
      parsed = {};
    }
    const accepted = parsed.success === true && parsed.data?.status === "correct";
    return {
      platform: this.id,
      challengeId,
      accepted,
      message: parsed.data?.message || (accepted ? "accepted" : "not accepted"),
    };
  }
}
