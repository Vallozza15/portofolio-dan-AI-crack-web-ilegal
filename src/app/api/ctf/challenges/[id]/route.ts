import { unlink } from "node:fs/promises";
import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import {
  audit,
  deleteChallenge,
  getChallenge,
  listFiles,
  resolveStoredFilePath,
  updateChallenge,
} from "@/lib/ctf/store";
import { CTF_CATEGORIES, type CtfCategory, type Difficulty } from "@/lib/ctf/types";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "insane", "unknown"];

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "challenge-get", 120);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const challenge = await getChallenge(id);
    if (!challenge) return noStoreJson({ error: "Challenge tidak ditemukan." }, { status: 404 });
    return noStoreJson({ challenge });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "challenge-update", 40);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const body = await readJson<Record<string, unknown>>(request);
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (title.length < 3 || title.length > 200) throw new Error("Judul harus 3–200 karakter.");
      patch.title = title;
    }
    if (typeof body.category === "string") {
      if (!CTF_CATEGORIES.includes(body.category as CtfCategory)) throw new Error("Kategori tidak valid.");
      patch.category = body.category;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 30_000) throw new Error("Deskripsi terlalu panjang.");
      patch.description = body.description.trim();
    }
    if (typeof body.difficulty === "string") {
      if (!DIFFICULTIES.includes(body.difficulty as Difficulty)) throw new Error("Kesulitan tidak valid.");
      patch.difficulty = body.difficulty;
    }
    if (typeof body.flagFormat === "string") {
      if (body.flagFormat.length > 120) throw new Error("Format flag terlalu panjang.");
      patch.flagFormat = body.flagFormat.trim();
    }
    if (typeof body.expectedFlag === "string") {
      if (body.expectedFlag.length > 500) throw new Error("Expected flag terlalu panjang.");
      patch.expectedFlag = body.expectedFlag.trim() || undefined;
    }
    if (typeof body.source === "string") patch.source = body.source.trim().slice(0, 500);
    if (Array.isArray(body.tags)) {
      patch.tags = body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20);
    }
    if (typeof body.status === "string" && ["VERIFIED", "LIKELY", "INCOMPLETE", "UNSOLVED"].includes(body.status)) {
      patch.status = body.status;
    }
    const challenge = await updateChallenge(id, patch);
    if (!challenge) return noStoreJson({ error: "Challenge tidak ditemukan." }, { status: 404 });
    await audit("challenge.update", `${challenge.title}: ${Object.keys(patch).join(", ")}`);
    return noStoreJson({ challenge });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "challenge-delete", 20);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const attachments = await listFiles(id);
    const removed = await deleteChallenge(id);
    if (!removed) return noStoreJson({ error: "Challenge tidak ditemukan." }, { status: 404 });
    for (const file of attachments) {
      try {
        await unlink(resolveStoredFilePath(file.storageName));
      } catch {
        // The record is removed even if the physical file was already gone.
      }
    }
    await audit("challenge.delete", `${id} (${attachments.length} file)`);
    return noStoreJson({ ok: true, removedFiles: attachments.length });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
