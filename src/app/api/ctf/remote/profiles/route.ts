import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import {
  deleteRemoteProfile,
  listRemoteProfiles,
} from "@/lib/ctf/store";
import {
  saveRemoteProfile,
  toPublicRemoteProfile,
} from "@/lib/ctf/autonomous/remote-profile-service";
import type { RemoteAuthMethod } from "@/lib/ctf/autonomous/types";

export const dynamic = "force-dynamic";

function sessionIdFrom(value: unknown): string {
  const id = String(value || "").trim();
  if (!id) throw new Error("sessionId wajib diisi.");
  if (id.length > 120) throw new Error("sessionId terlalu panjang.");
  return id;
}

function authMethodFrom(value: unknown): RemoteAuthMethod {
  const method = String(value || "password");
  if (method === "password" || method === "privateKey" || method === "agent") return method;
  throw new Error("Metode autentikasi remote tidak dikenal.");
}

export async function GET(request: Request) {
  const blocked = await guard(request, "remote-profiles-read", 120);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const sessionId = sessionIdFrom(url.searchParams.get("sessionId"));
    const profiles = await listRemoteProfiles(sessionId);
    return noStoreJson({
      profiles: profiles.map(toPublicRemoteProfile),
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "remote-profiles-write", 20);
  if (blocked) return blocked;
  try {
    const body = await readJson<{
      sessionId?: string;
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      authMethod?: RemoteAuthMethod;
      hostKeyFingerprint?: string;
      challengeId?: string;
      remoteCwd?: string;
      timeoutMs?: number;
      allowStateChanges?: boolean;
      password?: string;
      privateKey?: string;
      passphrase?: string;
    }>(request);
    const profile = await saveRemoteProfile({
      sessionId: sessionIdFrom(body.sessionId),
      name: String(body.name || ""),
      host: String(body.host || ""),
      port: Number(body.port || 22),
      username: String(body.username || ""),
      authMethod: authMethodFrom(body.authMethod),
      hostKeyFingerprint: String(body.hostKeyFingerprint || ""),
      challengeId: body.challengeId,
      remoteCwd: body.remoteCwd,
      timeoutMs: body.timeoutMs,
      allowStateChanges: body.allowStateChanges,
      password: body.password,
      privateKey: body.privateKey,
      passphrase: body.passphrase,
    });
    return noStoreJson({ ok: true, profile });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(request: Request) {
  const blocked = await guard(request, "remote-profiles-write", 20);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const profileId = String(url.searchParams.get("id") || "");
    if (!profileId) throw new Error("id profil wajib diisi.");
    const ok = await deleteRemoteProfile(profileId);
    return noStoreJson({ ok });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
