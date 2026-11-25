import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { analyzeText } from "@/lib/ctf/analyzer";

export async function POST(request: Request) {
  const blocked = await guard(request, "analyze-text", 60);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ text?: string; customFormat?: string }>(request);
    const text = String(body.text || "");
    if (text.length > 60_000) throw new Error("Teks terlalu panjang (maks 60.000 karakter).");
    const result = analyzeText(text, body.customFormat);
    return noStoreJson({ result });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
