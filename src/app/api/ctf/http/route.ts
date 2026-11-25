import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { safeFetch } from "@/lib/ctf/http";
import { getSettings } from "@/lib/ctf/store";

export async function POST(request: Request) {
  const blocked = await guard(request, "http-inspect", 25);
  if (blocked) return blocked;
  try {
    const body = await readJson<{
      url?: string;
      method?: "GET" | "HEAD";
      headers?: Record<string, string>;
    }>(request);
    const url = String(body.url || "").trim();
    if (!url) throw new Error("URL wajib diisi.");
    if (url.length > 2048) throw new Error("URL terlalu panjang.");
    const settings = await getSettings();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.headers || {}).slice(0, 30)) {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(key)) throw new Error(`Header tidak valid: ${key}`);
      const text = String(value);
      if (/[\r\n]/.test(text) || text.length > 1024) throw new Error(`Nilai header tidak valid: ${key}`);
      headers[key.toLowerCase()] = text;
    }
    const method = body.method === "HEAD" ? "HEAD" : "GET";
    const inspection = await safeFetch(url, {
      method,
      headers,
      allowPrivate: settings.system.allowPrivateHttp,
    });
    return noStoreJson({ inspection });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
