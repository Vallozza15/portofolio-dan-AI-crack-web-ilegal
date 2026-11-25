import { errorResponse, guard, noStoreJson, readJson } from "@/lib/ctf/api";
import { analyzeWithPythonBackend, pythonBackendHealth } from "@/lib/ctf/py-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guard(request, "python-health", 60);
  if (blocked) return blocked;
  return noStoreJson({
    url: process.env.CTF_PY_BACKEND_URL || "http://127.0.0.1:3131 (default)",
    health: await pythonBackendHealth(),
  });
}

export async function POST(request: Request) {
  const blocked = await guard(request, "python-analyze", 30);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ name?: string; bytesBase64?: string }>(request);
    if (!body.bytesBase64) throw new Error("bytesBase64 wajib diisi.");
    const bytes = Buffer.from(body.bytesBase64, "base64");
    if (!bytes.byteLength) throw new Error("Data artefak kosong.");
    const result = await analyzeWithPythonBackend(String(body.name || "artifact"), bytes);
    return noStoreJson(result);
  } catch (error) {
    return errorResponse(error, 400);
  }
}
