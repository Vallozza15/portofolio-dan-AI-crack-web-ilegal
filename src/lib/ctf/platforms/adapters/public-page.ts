import { authorizedFetchBytes } from "../authorized-fetch";
import { AuthorizedWebNavigator, type WebPageSnapshot } from "../../web/authorized-web-navigator";
import {
  PlatformAuthorizationError,
  type PlatformAdapter,
  type PlatformArtifactResult,
  type PlatformChallenge,
  type PlatformChallengeResult,
  type PlatformDiscoveryResult,
  type PlatformId,
  type PlatformRequestContext,
  type PlatformSubmissionResult,
} from "../types";

export interface PublicPlatformConfig {
  id: PlatformId;
  name: string;
  officialUrl: string;
  listingPath: string;
  challengePath: RegExp;
  requiresUserSession: boolean;
  notes: string[];
}

function sameOfficialHost(url: string, officialUrl: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "") === new URL(officialUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
}

function toChallenge(snapshot: WebPageSnapshot, id: string, officialApi = false): PlatformChallenge {
  const categoryMatch = snapshot.text.match(/\b(Crypto|Web|Forensics|Stego|Reverse|Pwn|Network|OSINT|Misc)\b/i);
  return {
    id,
    title: snapshot.title || id,
    url: snapshot.url,
    description: snapshot.text.slice(0, 4_000),
    categories: categoryMatch ? [categoryMatch[0]] : [],
    hints: snapshot.hints,
    artifacts: snapshot.artifacts,
    officialApi,
  };
}

/** Adapter for platforms that expose public challenge pages but no official API. */
export class PublicPagePlatformAdapter implements PlatformAdapter {
  readonly id: PlatformId;
  readonly name: string;
  readonly officialUrl: string;
  readonly supportsOfficialApi = false;
  readonly requiresUserSession: boolean;
  readonly capabilities: Array<"discover" | "read" | "download" | "submit"> = [
    "discover",
    "read",
    "download",
  ];
  private readonly notes: string[];
  private readonly listingPath: string;
  private readonly challengePath: RegExp;
  private readonly navigator = new AuthorizedWebNavigator();

  constructor(config: PublicPlatformConfig) {
    this.id = config.id;
    this.name = config.name;
    this.officialUrl = config.officialUrl;
    this.requiresUserSession = config.requiresUserSession;
    this.notes = config.notes;
    this.listingPath = config.listingPath;
    this.challengePath = config.challengePath;
  }

  private sessionLimitation(context: PlatformRequestContext): string | null {
    if (!this.requiresUserSession) return null;
    if (context.token) return null;
    return `${this.name} memerlukan sesi/token terautorisasi dari pengguna; tidak ada pengambilan data privat tanpa izin.`;
  }

  async discover(context: PlatformRequestContext): Promise<PlatformDiscoveryResult> {
    const limitations = [...this.notes];
    const sessionLimit = this.sessionLimitation(context);
    if (sessionLimit) limitations.push(sessionLimit);
    if (context.authorization !== "public" && context.authorization !== "user-session") {
      limitations.push("Mode autorisasi tidak dikenali.");
    }
    if (sessionLimit || context.authorization === "user-session" && !context.token) {
      return {
        platform: this.id,
        platformName: this.name,
        officialUrl: this.officialUrl,
        authorization: context.authorization,
        usedOfficialApi: false,
        challenges: [],
        limitations,
        retrievedAt: new Date().toISOString(),
      };
    }

    const listingUrl = new URL(this.listingPath, this.officialUrl).toString();
    const listing = await this.navigator.open(listingUrl, this.officialUrl, context);
    if (listing.requiresAuth) {
      limitations.push("Halaman daftar memerlukan login; tantangan tidak diambil.");
      return {
        platform: this.id,
        platformName: this.name,
        officialUrl: this.officialUrl,
        authorization: context.authorization,
        usedOfficialApi: false,
        challenges: [],
        limitations,
        retrievedAt: new Date().toISOString(),
      };
    }

    const links = [...new Set(listing.links)]
      .map((link) => {
        try {
          return new URL(link, listing.url).toString();
        } catch {
          return "";
        }
      })
      .filter((link) => link && this.challengePath.test(new URL(link).pathname) && sameOfficialHost(link, this.officialUrl))
      .slice(0, Math.min(context.maxChallenges || 20, 100));

    const challenges: PlatformChallenge[] = [];
    for (const link of links) {
      const snapshot = await this.navigator.open(link, this.officialUrl, context);
      if (snapshot.pageType === "unrelated" || snapshot.requiresAuth) continue;
      challenges.push(toChallenge(snapshot, new URL(link).pathname.split("/").filter(Boolean).pop() || link));
    }
    limitations.push("Konten halaman diperlakukan sebagai data tidak tepercaya; instruksi di dalamnya tidak dijalankan.");
    return {
      platform: this.id,
      platformName: this.name,
      officialUrl: this.officialUrl,
      authorization: context.authorization,
      usedOfficialApi: false,
      challenges,
      limitations,
      retrievedAt: new Date().toISOString(),
    };
  }

  async getChallenge(id: string, context: PlatformRequestContext): Promise<PlatformChallengeResult> {
    const discovered = await this.discover(context);
    const challenge = discovered.challenges.find((item) => item.id === id || item.url === id);
    if (!challenge) throw new PlatformAuthorizationError("Challenge tidak tersedia tanpa sesi terautorisasi.");
    return { platform: this.id, challenge, limitations: discovered.limitations };
  }

  async downloadArtifact(url: string, context: PlatformRequestContext): Promise<PlatformArtifactResult> {
    const result = await authorizedFetchBytes(url, this.officialUrl, context);
    const filename = new URL(result.url).pathname.split("/").filter(Boolean).pop() || "artifact.bin";
    return { platform: this.id, url: result.url, filename, mimeType: result.contentType, bytes: result.bytes };
  }

  async submitAnswer(
    _challengeId: string,
    _answer: string,
    _context: PlatformRequestContext,
  ): Promise<PlatformSubmissionResult> {
    void _challengeId;
    void _answer;
    void _context;
    throw new PlatformAuthorizationError(`${this.name} tidak memiliki API pengiriman jawaban resmi yang diintegrasikan.`);
  }
}
