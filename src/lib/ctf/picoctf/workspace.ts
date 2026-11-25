import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Physical, per-challenge workspaces for picoCTF/picoGym practice.
 *
 * The root is operator-controlled via CTF_WORKSPACE_ROOT. On Windows the
 * default is C:\CTF-AI as requested. Nothing here executes files.
 */

export interface ChallengeWorkspace {
  challengeId: string;
  root: string;
  challengeDir: string;
  attachmentsDir: string;
  analysisDir: string;
  evidenceDir: string;
  reportsDir: string;
  manifestPath: string;
}

export interface WorkspaceManifest {
  challengeId: string;
  title?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  directories: string[];
  notes: string[];
}

export function workspaceRoot(): string {
  const configured = process.env.CTF_WORKSPACE_ROOT?.trim();
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  if (process.platform === "win32") return "C:\\CTF-AI";
  return path.resolve(process.cwd(), ".data", "picoctf-workspaces");
}

export function safeChallengeSlug(challengeId: string): string {
  const raw = challengeId.trim().replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 48) || "challenge";
  const digest = createHash("sha256").update(challengeId).digest("hex").slice(0, 12);
  return `${raw}-${digest}`;
}

export function challengeWorkspacePaths(challengeId: string): ChallengeWorkspace {
  if (!challengeId.trim()) throw new Error("challengeId diperlukan untuk workspace per challenge.");
  const root = workspaceRoot();
  const challengeDir = path.join(root, "challenges", safeChallengeSlug(challengeId));
  return {
    challengeId,
    root,
    challengeDir,
    attachmentsDir: path.join(challengeDir, "attachments"),
    analysisDir: path.join(challengeDir, "analysis"),
    evidenceDir: path.join(challengeDir, "evidence"),
    reportsDir: path.join(challengeDir, "reports"),
    manifestPath: path.join(challengeDir, "workspace.json"),
  };
}

export function attachmentRelativePath(challengeId: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "attachment.bin";
  return path.join("challenges", safeChallengeSlug(challengeId), "attachments", safeName).split(path.sep).join("/");
}

export async function ensureChallengeWorkspace(
  challengeId: string,
  metadata: { title?: string; source?: string } = {},
): Promise<ChallengeWorkspace> {
  const workspace = challengeWorkspacePaths(challengeId);
  await Promise.all([
    mkdir(workspace.challengeDir, { recursive: true }),
    mkdir(workspace.attachmentsDir, { recursive: true }),
    mkdir(workspace.analysisDir, { recursive: true }),
    mkdir(workspace.evidenceDir, { recursive: true }),
    mkdir(workspace.reportsDir, { recursive: true }),
  ]);
  const now = new Date().toISOString();
  let previous: Partial<WorkspaceManifest> = {};
  try {
    previous = JSON.parse(await readFile(workspace.manifestPath, "utf8")) as Partial<WorkspaceManifest>;
  } catch {
    previous = {};
  }
  const manifest: WorkspaceManifest = {
    challengeId,
    title: metadata.title || previous.title,
    source: metadata.source || previous.source,
    createdAt: previous.createdAt || now,
    updatedAt: now,
    directories: ["attachments", "analysis", "evidence", "reports"],
    notes: [
      "Artefak tidak pernah dieksekusi di host.",
      "Analisis Kali berjalan di container dengan mount read-only.",
      "Alamat instance challenge harus berasal dari operator, bukan dari writeup publik.",
    ],
  };
  await writeFile(workspace.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return workspace;
}
