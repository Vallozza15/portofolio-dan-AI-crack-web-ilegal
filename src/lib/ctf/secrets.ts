import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "./store";

/**
 * Shared AES-256-GCM helper for every secret persisted by the CTF workspace.
 * Previously this lived in ai.ts; SSH credentials use the same master key so
 * rotating CTF_MASTER_KEY invalidates provider and remote secrets consistently.
 */

let masterKeyCache: Buffer | null = null;

async function getMasterKey(): Promise<Buffer> {
  if (masterKeyCache) return masterKeyCache;
  const envKey = process.env.CTF_MASTER_KEY;
  if (envKey && envKey.length >= 16) {
    masterKeyCache = scryptSync(envKey, "ctf-intelligence-v1", 32);
    return masterKeyCache;
  }
  const keyFile = path.join(getDataDir(), "master.key");
  try {
    const existing = await readFile(keyFile);
    if (existing.length === 32) {
      masterKeyCache = existing;
      return existing;
    }
  } catch {
    // Generate below.
  }
  const generated = randomBytes(32);
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(keyFile, generated, { mode: 0o600 });
  masterKeyCache = generated;
  return generated;
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Format secret terenkripsi tidak dikenal.");
  }
  const key = await getMasterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
