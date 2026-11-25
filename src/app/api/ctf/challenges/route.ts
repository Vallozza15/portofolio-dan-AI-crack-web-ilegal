import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { audit, createChallenge, listChallenges } from "@/lib/ctf/store";
import { CTF_CATEGORIES, type CtfCategory, type Difficulty } from "@/lib/ctf/types";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "insane", "unknown"];

export async function GET(request: Request) {
  const blocked = await guard(request, "challenges-list", 120);
  if (blocked) return blocked;
  try {
    return noStoreJson({ challenges: await listChallenges() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "challenges-create", 30);
  if (blocked) return blocked;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const title = String(body.title || "").trim();
    const category = String(body.category || "");
    const description = String(body.description || "").trim();
    const difficulty = String(body.difficulty || "unknown") as Difficulty;
    const flagFormat = String(body.flagFormat || "flag{...}").trim();
    const expectedFlag = String(body.expectedFlag || "").trim();
    const source = String(body.source || "").trim();
    const tags = Array.isArray(body.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : [];
    if (title.length < 3 || title.length > 200) throw new Error("Judul harus 3–200 karakter.");
    if (!CTF_CATEGORIES.includes(category as CtfCategory)) throw new Error("Kategori tidak valid.");
    if (description.length > 30_000) throw new Error("Deskripsi terlalu panjang (maks 30.000 karakter).");
    if (!DIFFICULTIES.includes(difficulty)) throw new Error("Kesulitan tidak valid.");
    if (flagFormat.length > 120) throw new Error("Format flag terlalu panjang.");
    if (expectedFlag.length > 500) throw new Error("Expected flag terlalu panjang.");
    if (source.length > 500) throw new Error("Sumber terlalu panjang.");
    const challenge = await createChallenge({
      title,
      category: category as CtfCategory,
      description,
      difficulty,
      flagFormat,
      expectedFlag: expectedFlag || undefined,
      source: source || undefined,
      tags,
    });
    await audit("challenge.create", `${challenge.title} (${challenge.category})`);
    return noStoreJson({ challenge }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
