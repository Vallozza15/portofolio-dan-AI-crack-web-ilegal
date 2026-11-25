/** Client for the optional Python/FastAPI sidecar. Never sends secrets. */
const BASE_URL = process.env.CTF_PY_BACKEND_URL || "http://127.0.0.1:3131";
const TIMEOUT_MS = 15_000;

export interface PythonArtifactAnalysis {
  name?: string;
  size?: number;
  sha256?: string;
  mimeGuess?: string;
  entropy?: number;
  strings?: string[];
  hints?: string[];
  untrusted?: boolean;
  error?: string;
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Python backend HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

export async function pythonBackendHealth(): Promise<{ status: string; service?: string; maxBytes?: number } | null> {
  try {
    return (await call("/health")) as { status: string; service?: string; maxBytes?: number };
  } catch {
    return null;
  }
}

/** Sends a bounded base64 artifact for stdlib-only inspection in the sidecar. */
export async function analyzeWithPythonBackend(name: string, bytes: Buffer): Promise<PythonArtifactAnalysis> {
  if (bytes.byteLength > 10_000_000) throw new Error("Artefak terlalu besar untuk backend Python (maks 10 MB).");
  return (await call("/analyze", {
    method: "POST",
    body: JSON.stringify({ name: name.slice(0, 200), dataBase64: bytes.toString("base64") }),
  })) as PythonArtifactAnalysis;
}
