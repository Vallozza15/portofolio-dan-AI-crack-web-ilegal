import { authorizeRemoteEndpoint } from "./config";
import { encryptSecret } from "../secrets";
import {
  addRemoteAudit,
  addRemoteProfile,
  findRemoteProfileByName,
  getRemoteProfile,
  listRemoteProfiles,
  updateRemoteProfile,
} from "../store";
import type { PublicRemoteProfile, RemoteProfileInput, RemoteProfileRecord } from "./types";

export function toPublicRemoteProfile(record: RemoteProfileRecord): PublicRemoteProfile {
  return {
    id: record.id,
    name: record.name,
    host: record.host,
    port: record.port,
    username: record.username,
    authMethod: record.authMethod,
    hostKeyFingerprint: record.hostKeyFingerprint,
    challengeId: record.challengeId,
    remoteCwd: record.remoteCwd,
    timeoutMs: record.timeoutMs,
    allowStateChanges: record.allowStateChanges,
    authorized: record.authorized,
    hasPassword: Boolean(record.passwordEnc),
    hasPrivateKey: Boolean(record.privateKeyEnc),
    hasPassphrase: Boolean(record.passphraseEnc),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastConnectedAt: record.lastConnectedAt,
  };
}

/** Creates or updates a profile; secrets are encrypted before touching the store. */
export async function saveRemoteProfile(input: RemoteProfileInput): Promise<PublicRemoteProfile> {
  const authorization = authorizeRemoteEndpoint(input.host, input.port);
  if (!authorization.ok) throw new Error(authorization.reason);
  if (!input.name.trim()) throw new Error("Nama profil wajib diisi.");
  if (!input.username.trim()) throw new Error("Username remote wajib diisi.");
  if (!input.hostKeyFingerprint.trim()) {
    throw new Error("Sidik jari host key wajib diisi; host key tidak boleh diterima otomatis.");
  }
  if (input.authMethod === "password" && !input.password) {
    throw new Error("Password wajib diisi untuk metode autentikasi password.");
  }
  if (input.authMethod === "privateKey" && !input.privateKey) {
    throw new Error("Private key wajib diisi untuk metode autentikasi private key.");
  }

  const now = new Date().toISOString();
  const encrypted = {
    passwordEnc: input.password ? await encryptSecret(input.password) : undefined,
    privateKeyEnc: input.privateKey ? await encryptSecret(input.privateKey) : undefined,
    passphraseEnc: input.passphrase ? await encryptSecret(input.passphrase) : undefined,
  };
  const updatePatch: Partial<RemoteProfileRecord> = {
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    authMethod: input.authMethod,
    hostKeyFingerprint: input.hostKeyFingerprint.trim(),
    challengeId: input.challengeId,
    remoteCwd: input.remoteCwd,
    timeoutMs: input.timeoutMs || 20_000,
    allowStateChanges: Boolean(input.allowStateChanges),
    authorized: true,
    updatedAt: now,
    ...encrypted,
  };
  if (!input.password) updatePatch.passwordEnc = undefined;
  if (!input.privateKey) updatePatch.privateKeyEnc = undefined;
  if (!input.passphrase) updatePatch.passphraseEnc = undefined;

  const existing = await findRemoteProfileByName(input.sessionId, input.name.trim());
  const record = existing
    ? ((await updateRemoteProfile(existing.id, updatePatch)) || existing)
    : await addRemoteProfile({
        sessionId: input.sessionId,
        name: input.name.trim(),
        host: input.host.trim(),
        port: input.port,
        username: input.username.trim(),
        authMethod: input.authMethod,
        hostKeyFingerprint: input.hostKeyFingerprint.trim(),
        challengeId: input.challengeId,
        remoteCwd: input.remoteCwd,
        timeoutMs: input.timeoutMs || 20_000,
        allowStateChanges: Boolean(input.allowStateChanges),
        authorized: true,
        status: "disconnected",
        ...encrypted,
      });

  await addRemoteAudit({
    sessionId: input.sessionId,
    profileId: record.id,
    action: existing ? "remote.profile.update" : "remote.profile.create",
    detail: `${record.name}: ${record.username}@${record.host}:${record.port}, fingerprint=${record.hostKeyFingerprint.slice(0, 16)}`,
  });
  return toPublicRemoteProfile(record);
}

export async function findProfileForSession(
  sessionId: string,
  profileId?: string,
  name?: string,
): Promise<RemoteProfileRecord | null> {
  if (profileId) {
    const byId = await getRemoteProfile(profileId);
    if (byId) return byId;
    // Interpreters may place a profile name in the id slot. Names are not IDs.
    return findRemoteProfileByName(sessionId, profileId);
  }
  if (name) return findRemoteProfileByName(sessionId, name);
  const profiles = await listRemoteProfiles(sessionId);
  return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}
