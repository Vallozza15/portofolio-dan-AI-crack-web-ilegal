import { errorResponse, guard, noStoreJson } from "@/lib/ctf/api";
import {
  getPlatformAdapter,
  listPlatformAdapters,
} from "@/lib/ctf/platforms/registry";
import {
  PlatformAuthorizationError,
  type PlatformId,
  type PlatformRequestContext,
} from "@/lib/ctf/platforms/types";
import {
  listPlatformConnections,
  listVerificationRecords,
  savePlatformConnection,
} from "@/lib/ctf/store";

export const runtime = "nodejs";

function adapterList() {
  return listPlatformAdapters().map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    officialUrl: adapter.officialUrl,
    supportsOfficialApi: adapter.supportsOfficialApi,
    requiresUserSession: adapter.requiresUserSession,
    capabilities: adapter.capabilities,
  }));
}

export async function GET(request: Request) {
  const blocked = await guard(request, "platforms-list", 60);
  if (blocked) return blocked;
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId") || undefined;
    return noStoreJson({
      platforms: adapterList(),
      connections: await listPlatformConnections(sessionId),
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

interface PlatformBody {
  action?: string;
  platform?: PlatformId;
  platforms?: PlatformId[];
  challengeId?: string;
  url?: string;
  answer?: string;
  authorized?: boolean;
  authorization?: "public" | "user-session";
  token?: string;
  sessionCookie?: string;
  officialBaseUrl?: string;
  allowSubmission?: boolean;
  allowLocalEndpoints?: boolean;
  maxChallenges?: number;
  sessionId?: string;
}

function contextOf(body: PlatformBody): PlatformRequestContext {
  if (body.authorized !== true) {
    throw new PlatformAuthorizationError("Penemuan platform memerlukan authorized=true dari operator.");
  }
  return {
    authorized: true,
    authorization: body.authorization === "user-session" ? "user-session" : "public",
    ...(body.token ? { token: body.token } : {}),
    ...(body.sessionCookie ? { sessionCookie: body.sessionCookie } : {}),
    ...(body.officialBaseUrl ? { officialBaseUrl: body.officialBaseUrl } : {}),
    ...(body.allowSubmission ? { allowSubmission: true } : {}),
    ...(body.allowLocalEndpoints ? { allowLocalEndpoints: true } : {}),
    maxChallenges: Math.min(Math.max(body.maxChallenges || 20, 1), 100),
    maxBytes: 2_000_000,
    timeoutMs: 15_000,
  };
}

export async function POST(request: Request) {
  const blocked = await guard(request, "platforms-action", 30);
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as PlatformBody;
    const action = body.action || "list";
    if (action === "list") return noStoreJson({ platforms: adapterList() });

    const context = contextOf(body);
    if (action === "discover" || action === "discover-many") {
      const ids = action === "discover-many"
        ? [...new Set(body.platforms || [])]
        : body.platform
          ? [body.platform]
          : [];
      if (!ids.length) throw new PlatformAuthorizationError("Platform tidak ditentukan.");
      const results = [];
      for (const id of ids.slice(0, 20)) {
        const adapter = getPlatformAdapter(id);
        const result = await adapter.discover(context);
        await savePlatformConnection({
          platform: result.platform,
          platformName: result.platformName,
          officialUrl: result.officialUrl,
          authorization: result.authorization,
          usedOfficialApi: result.usedOfficialApi,
          sessionId: body.sessionId,
          challengeCount: result.challenges.length,
          limitations: result.limitations,
        });
        results.push(result);
      }
      return noStoreJson({ results });
    }

    if (!body.platform) throw new PlatformAuthorizationError("Platform tidak ditentukan.");
    const adapter = getPlatformAdapter(body.platform);
    if (action === "read") {
      if (!body.challengeId) throw new PlatformAuthorizationError("challengeId diperlukan.");
      const result = await adapter.getChallenge(body.challengeId, context);
      return noStoreJson(result);
    }
    if (action === "download") {
      if (!body.url) throw new PlatformAuthorizationError("URL artefak diperlukan.");
      const result = await adapter.downloadArtifact(body.url, context);
      return noStoreJson({
        platform: result.platform,
        url: result.url,
        filename: result.filename,
        mimeType: result.mimeType,
        bytesBase64: Buffer.from(result.bytes).toString("base64"),
        size: result.bytes.byteLength,
      });
    }
    if (action === "submit") {
      if (!body.allowSubmission) {
        throw new PlatformAuthorizationError("Pengiriman jawaban memerlukan allowSubmission=true.");
      }
      if (!body.sessionId || !body.challengeId || !body.answer) {
        throw new PlatformAuthorizationError("sessionId, challengeId, dan answer diperlukan.");
      }
      const confirmed = (await listVerificationRecords(body.sessionId)).find(
        (item) => item.confirmed && item.candidate === body.answer,
      );
      if (!confirmed) {
        throw new PlatformAuthorizationError("Jawaban belum terverifikasi oleh sistem; tidak dikirim ke platform.");
      }
      const result = await adapter.submitAnswer(body.challengeId, body.answer, context);
      return noStoreJson(result);
    }
    throw new PlatformAuthorizationError(`Aksi ${action} tidak dikenali.`);
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) return errorResponse(error, 403);
    return errorResponse(error, 500);
  }
}
