import { analyzeText, generateLocalReport } from "./analyzer";
import { decryptSecret, encryptSecret } from "./secrets";
import { getSettings } from "./store";
import type {
  AiSettings,
  CtfSettings,
  LocalAnalysisBundle,
  ProviderId,
  ProviderStatus,
  PublicProviderConfig,
  SessionMode,
  VerificationStatus,
} from "./types";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantStreamEvent {
  type: "meta" | "delta" | "note" | "error" | "done";
  provider?: ProviderId;
  model?: string;
  text?: string;
  message?: string;
  status?: VerificationStatus;
}

interface ResolvedProvider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  keySource: "saved" | "env" | "none";
  temperature: number;
  maxTokens: number;
}

const ENV_KEYS: Record<ProviderId, string[]> = {
  openai: ["CTF_OPENAI_API_KEY", "OPENAI_API_KEY"],
  anthropic: ["CTF_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  gemini: ["CTF_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
  ollama: [],
  compatible: [
    "CTF_COMPATIBLE_API_KEY",
    "OPENAI_COMPATIBLE_API_KEY",
    "OPENROUTER_API_KEY",
  ],
  local: [],
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  ollama: "Ollama (local)",
  compatible: "OpenAI-compatible",
  local: "Local Analyst",
};

export { decryptSecret, encryptSecret };

function envValue(names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function resolveProvider(
  id: ProviderId,
  settings: AiSettings,
): Promise<ResolvedProvider | null> {
  const config = settings.providers.find((item) => item.id === id);
  if (!config) return null;
  let apiKey = "";
  let keySource: ResolvedProvider["keySource"] = "none";
  if (config.apiKeyEnc) {
    try {
      apiKey = await decryptSecret(config.apiKeyEnc);
      keySource = "saved";
    } catch {
      apiKey = "";
    }
  }
  if (!apiKey) {
    apiKey = envValue(ENV_KEYS[id]);
    if (apiKey) keySource = "env";
  }
  let baseUrl = config.baseUrl;
  let model = config.model;
  if (id === "compatible") {
    baseUrl = baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || "";
    model = model || process.env.OPENAI_COMPATIBLE_MODEL || "";
  }
  if (id === "ollama") {
    baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
    model = model || process.env.OLLAMA_MODEL || "llama3.2";
  }
  return {
    id,
    label: PROVIDER_LABELS[id],
    baseUrl: normalizeBaseUrl(baseUrl),
    model,
    apiKey,
    keySource,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

export function providerAvailable(resolved: ResolvedProvider): boolean {
  if (resolved.id === "local") return true;
  if (resolved.id === "ollama") return Boolean(resolved.baseUrl && resolved.model);
  if (resolved.id === "compatible") {
    return Boolean(resolved.baseUrl && resolved.model);
  }
  return Boolean(resolved.apiKey && resolved.baseUrl && resolved.model);
}

export function providerUnavailableReason(resolved: ResolvedProvider): string {
  if (resolved.id === "ollama") {
    return "Ollama membutuhkan base URL dan nama model; server lokal harus berjalan.";
  }
  if (resolved.id === "compatible") {
    return "Provider OpenAI-compatible membutuhkan base URL dan model. API key opsional untuk server lokal.";
  }
  if (!resolved.apiKey) return "API key belum dikonfigurasi (settings atau environment).";
  if (!resolved.baseUrl) return "Base URL belum diisi.";
  if (!resolved.model) return "Nama model belum diisi.";
  return "Provider belum siap.";
}

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const settings = await getSettings();
  const ids: ProviderId[] = ["openai", "anthropic", "gemini", "ollama", "compatible", "local"];
  const statuses: ProviderStatus[] = [];
  for (const id of ids) {
    const resolved = await resolveProvider(id, settings.ai);
    if (!resolved) continue;
    if (id === "local") {
      statuses.push({
        id,
        label: resolved.label,
        configured: true,
        source: "none",
        model: "deterministic-engine",
        baseUrl: "local",
        note: "Analis deterministik berbasis bukti. Tidak memanggil LLM dan tidak mengarang eksekusi tool.",
      });
      continue;
    }
    statuses.push({
      id,
      label: resolved.label,
      configured: providerAvailable(resolved),
      source: resolved.keySource,
      model: resolved.model || "—",
      baseUrl: resolved.baseUrl || "—",
      note: providerAvailable(resolved)
        ? id === "ollama"
          ? "Siap dipakai jika server Ollama lokal aktif."
          : "Konfigurasi lengkap. Koneksi diuji saat permintaan dikirim."
        : providerUnavailableReason(resolved),
    });
  }
  return statuses;
}

export async function getPublicProviderConfigs(): Promise<PublicProviderConfig[]> {
  const settings = await getSettings();
  const result: PublicProviderConfig[] = [];
  for (const config of settings.ai.providers) {
    const resolved = await resolveProvider(config.id, settings.ai);
    if (!resolved) continue;
    result.push({
      id: config.id,
      label: config.label,
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      hasKey: Boolean(resolved.apiKey) || config.id === "ollama",
      keySource: resolved.keySource,
      available: providerAvailable(resolved),
    });
  }
  return result;
}

export async function providerConfigHasKey(id: ProviderId): Promise<boolean> {
  const settings = await getSettings();
  const resolved = await resolveProvider(id, settings.ai);
  return Boolean(resolved?.apiKey);
}

const SYSTEM_PROMPT_ID = `Kamu adalah CTF Intelligence, analis keamanan siber untuk platform latihan CTF yang sah dan terotorisasi.

ATURAN WAJIB:
1. Jawab dengan struktur bernomor berikut, tanpa menghilangkan bagian apa pun:
   1. IDENTIFIKASI
   2. ANALISIS AWAL
   3. TOOLS
   4. LANGKAH
   5. PROSES
   6. HASIL
   7. PEMBELAJARAN
   8. STATUS VERIFIKASI
2. Status verifikasi hanya salah satu dari: VERIFIED, LIKELY, INCOMPLETE, UNSOLVED.
   - VERIFIED hanya jika flag cocok dengan expected flag yang diberikan atau diverifikasi eksplisit oleh pengguna/platform.
   - LIKELY jika ada kandidat kuat tetapi belum diverifikasi.
   - INCOMPLETE jika ada petunjuk tetapi rantai bukti belum lengkap.
   - UNSOLVED jika belum ada kandidat.
3. Jangan pernah mengarang flag, output tool, hash, packet, atau hasil eksekusi. Jika data tidak tersedia, tulis "tidak tersedia" dan jelaskan cara memperolehnya.
4. Bagian TOOLS hanya boleh menyebut tool yang benar-benar tersedia di konteks bukti atau tool eksternal sebagai rekomendasi, dengan label jelas "rekomendasi (belum dijalankan)".
5. Jangan mengeksekusi malware atau binary yang diunggah. Sarankan sandbox Docker terisolasi untuk analisis dinamis.
6. Utamakan bukti dari file yang diunggah dan parser lokal. Bukti mengalahkan tebakan kata kunci.
7. Jika mode "hint", jangan tampilkan flag final; berikan petunjuk bertahap.
8. Jika mode "learning", jelaskan alasan setiap langkah secara edukatif.
9. Jika mode "expert", lebih ringkas dan langsung pada teknis.
10. Jangan membantu menyerang sistem nyata tanpa otorisasi. Fokus pada lab CTF dan pertahanan.`;

const SYSTEM_PROMPT_EN = `You are CTF Intelligence, a cybersecurity analyst for authorized CTF training.

MANDATORY RULES:
1. Always answer with these numbered sections:
   1. IDENTIFICATION
   2. INITIAL ANALYSIS
   3. TOOLS
   4. STEPS
   5. PROCESS
   6. RESULT
   7. LEARNING
   8. VERIFICATION STATUS
2. Verification status must be one of: VERIFIED, LIKELY, INCOMPLETE, UNSOLVED.
   - VERIFIED only when a flag matches a supplied expected flag or is explicitly verified.
   - LIKELY for a strong unverified candidate.
   - INCOMPLETE when evidence is insufficient.
   - UNSOLVED when there is no candidate.
3. Never fabricate flags, tool output, hashes, packets, or execution results. State "not available" and explain how to obtain it.
4. In TOOLS, distinguish tools that actually produced evidence from external recommendations labelled "recommended (not executed)".
5. Never execute uploaded malware or binaries. Recommend an isolated Docker sandbox for dynamic analysis.
6. Prefer uploaded-file evidence and local parser output over keyword guesses.
7. In "hint" mode, do not reveal the final flag; give progressive hints.
8. In "learning" mode, explain the reasoning step by step.
9. In "expert" mode, be concise and technical.
10. Do not assist attacks on real systems without authorization. Focus on CTF labs and defense.`;

function systemPrompt(mode: SessionMode, language: "id" | "en", custom: string) {
  const base = language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ID;
  const modeLine =
    mode === "hint"
      ? "MODE: HINT — progressive hints only, no final flag."
      : mode === "expert"
        ? "MODE: EXPERT — concise technical detail."
        : "MODE: LEARNING — educational, step by step.";
  const languageLine =
    language === "en" ? "OUTPUT LANGUAGE: English." : "BAHASA OUTPUT: Bahasa Indonesia.";
  return [base, modeLine, languageLine, custom.trim()].filter(Boolean).join("\n\n");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n… [dipotong ${value.length - max} karakter]`;
}

export function buildEvidenceContext(
  bundle: LocalAnalysisBundle | undefined,
  extraEvidence: Array<{ title: string; summary: string; detail: string; confidence: string }> = [],
): string {
  if (!bundle && !extraEvidence.length) {
    return "Tidak ada bukti file/challenge yang dilampirkan pada sesi ini.";
  }
  const lines: string[] = [];
  if (bundle) {
    const challenge = bundle.challenge;
    lines.push("## Challenge");
    lines.push(`Judul: ${challenge.title}`);
    lines.push(`Kategori: ${bundle.category}`);
    lines.push(`Kesulitan: ${challenge.difficulty}`);
    lines.push(`Format flag: ${challenge.flagFormat}`);
    lines.push(`Expected flag (lokal): ${challenge.expectedFlag || "tidak ditetapkan"}`);
    lines.push(`Deskripsi: ${truncate(challenge.description || "—", 2000)}`);
    lines.push("");
    lines.push("## Analisis teks deterministik");
    lines.push(`Kategori terdeteksi: ${bundle.text.category} (confidence ${bundle.text.categoryConfidence})`);
    lines.push(`Kandidat flag dari teks: ${bundle.text.flagCandidates.map((item) => item.value).join(", ") || "tidak ada"}`);
    if (bundle.text.decodedLayers.length) {
      lines.push("Lapisan decoding:");
      for (const layer of bundle.text.decodedLayers.slice(0, 5)) {
        lines.push(`- ${layer.operation}: ${truncate(layer.value.replace(/\s+/g, " "), 300)}`);
      }
    }
    lines.push("");
    lines.push("## File yang benar-benar dianalisis");
    if (!bundle.files.length) lines.push("Tidak ada file.");
    for (const file of bundle.files) {
      lines.push(`### ${file.name}`);
      lines.push(`Tipe: ${file.magic} | Ukuran: ${file.size} B | Entropy: ${file.entropy} | MIME: ${file.mime}`);
      lines.push(`SHA-256: ${file.sha256}`);
      lines.push(`Kategori: ${file.categoryHints.join(", ")} | String: ${file.stringCount}`);
      if (file.image) lines.push(`Image: ${JSON.stringify(file.image).slice(0, 1200)}`);
      if (file.audio) lines.push(`Audio: ${JSON.stringify(file.audio).slice(0, 800)}`);
      if (file.pdf) lines.push(`PDF: ${JSON.stringify(file.pdf).slice(0, 800)}`);
      if (file.archive) {
        lines.push(`Arsip ${file.archive.format}: ${file.archive.entries.slice(0, 25).map((entry) => `${entry.name} (${entry.uncompressedSize} B${entry.encrypted ? ", encrypted" : ""})`).join("; ")}`);
      }
      if (file.executable) {
        lines.push(`Executable: ${file.executable.format} ${file.executable.architecture} ${file.executable.bits}-bit`);
        lines.push(`Security: ${file.executable.security.map((item) => `${item.name}=${item.enabled === null ? "?" : item.enabled ? "on" : "off"}`).join(", ")}`);
        lines.push(`Sections: ${file.executable.sections.slice(0, 20).map((section) => `${section.name}(e=${section.entropy})`).join(", ")}`);
        lines.push(`Imports: ${file.executable.imports.slice(0, 10).map((item) => `${item.library}: ${item.functions.slice(0, 8).join(",")}`).join(" | ")}`);
      }
      if (file.pcap) {
        lines.push(`PCAP: ${file.pcap.packetCount} paket; protokol ${JSON.stringify(file.pcap.protocols)}; DNS ${file.pcap.dnsQueries.slice(0, 10).join(", ")}; HTTP ${file.pcap.httpHosts.slice(0, 10).join(", ")}`);
      }
      for (const finding of file.stego.slice(0, 8)) {
        lines.push(`Stego [${finding.confidence}] ${finding.technique}: ${truncate(finding.detail, 400)}`);
      }
      lines.push(`Flag candidates: ${file.flagCandidates.map((candidate) => `${candidate.value} (${candidate.source}, ${candidate.confidence})`).join("; ") || "tidak ada"}`);
      if (file.strings.length) lines.push(`String sensitif: ${file.strings.filter((value) => /flag|secret|key|pass|token|http|admin/i.test(value)).slice(0, 15).join(" | ")}`);
      if (file.warnings.length) lines.push(`Peringatan: ${file.warnings.slice(0, 5).join(" | ")}`);
      lines.push("");
    }
    lines.push("## Bukti terstruktur");
    for (const evidence of bundle.evidence.slice(0, 20)) {
      lines.push(`- [${evidence.confidence}] ${evidence.title}: ${truncate(evidence.summary, 300)}`);
    }
    lines.push("");
    lines.push("## Operasi lokal yang benar-benar dijalankan");
    for (const run of bundle.toolRuns.slice(0, 30)) {
      lines.push(`- ${run.tool}(${run.args.join(" ")}) → ${run.status}: ${truncate(run.summary, 240)}`);
    }
    lines.push("");
    lines.push(`Status deterministik saat ini: ${bundle.status}`);
  }
  if (extraEvidence.length) {
    lines.push("## Bukti tambahan / output terminal");
    for (const item of extraEvidence) {
      lines.push(`- [${item.confidence}] ${item.title}: ${item.summary}`);
      if (item.detail) {
        lines.push("```text");
        lines.push(truncate(item.detail, 2500));
        lines.push("```");
      }
    }
  }
  return truncate(lines.join("\n"), 30_000);
}

async function* readLines(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("Response provider tidak memiliki body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        yield line;
        index = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) yield buffer.replace(/\r$/, "");
  } finally {
    reader.releaseLock();
  }
}

function parseSseData(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  return data;
}

async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return truncate(text.replace(/\s+/g, " ").trim(), 500) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

interface ProviderStream {
  provider: ResolvedProvider;
  stream: AsyncGenerator<string>;
}

async function openOpenAiStream(
  provider: ResolvedProvider,
  system: string,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderStream> {
  const endpoint = `${provider.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: provider.model,
      temperature: provider.temperature,
      max_tokens: provider.maxTokens,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`${provider.label}: ${await readError(response)}`);
  }
  async function* parse(): AsyncGenerator<string> {
    for await (const line of readLines(response)) {
      const data = parseSseData(line);
      if (!data) continue;
      try {
        const payload = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = payload.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // Ignore keepalive or malformed fragments.
      }
    }
  }
  return { provider, stream: parse() };
}

async function openAnthropicStream(
  provider: ResolvedProvider,
  system: string,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderStream> {
  const response = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      system,
      max_tokens: provider.maxTokens,
      temperature: provider.temperature,
      stream: true,
      messages: messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`${provider.label}: ${await readError(response)}`);
  }
  async function* parse(): AsyncGenerator<string> {
    for await (const line of readLines(response)) {
      const data = parseSseData(line);
      if (!data) continue;
      try {
        const payload = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
          if (payload.delta.text) yield payload.delta.text;
        }
      } catch {
        // Ignore malformed fragments.
      }
    }
  }
  return { provider, stream: parse() };
}

async function openGeminiStream(
  provider: ResolvedProvider,
  system: string,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderStream> {
  const endpoint = `${provider.baseUrl}/models/${encodeURIComponent(provider.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.apiKey)}`;
  const contents = messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: provider.temperature,
        maxOutputTokens: provider.maxTokens,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`${provider.label}: ${await readError(response)}`);
  }
  async function* parse(): AsyncGenerator<string> {
    for await (const line of readLines(response)) {
      const data = parseSseData(line);
      if (!data) continue;
      try {
        const payload = JSON.parse(data) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const parts = payload.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) yield part.text;
        }
      } catch {
        // Ignore malformed fragments.
      }
    }
  }
  return { provider, stream: parse() };
}

async function openOllamaStream(
  provider: ResolvedProvider,
  system: string,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderStream> {
  const response = await fetch(`${provider.baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      options: {
        temperature: provider.temperature,
        num_predict: provider.maxTokens,
      },
      messages: [
        { role: "system", content: system },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`${provider.label}: ${await readError(response)}`);
  }
  async function* parse(): AsyncGenerator<string> {
    for await (const line of readLines(response)) {
      if (!line.trim()) continue;
      try {
        const payload = JSON.parse(line) as {
          message?: { content?: string };
          error?: string;
        };
        if (payload.error) throw new Error(payload.error);
        if (payload.message?.content) yield payload.message.content;
      } catch (error) {
        if (error instanceof Error && error.message && !error.message.startsWith("Unexpected")) {
          throw error;
        }
      }
    }
  }
  return { provider, stream: parse() };
}

async function openProviderStream(
  provider: ResolvedProvider,
  system: string,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<ProviderStream> {
  switch (provider.id) {
    case "openai":
    case "compatible":
      return openOpenAiStream(provider, system, messages, signal);
    case "anthropic":
      return openAnthropicStream(provider, system, messages, signal);
    case "gemini":
      return openGeminiStream(provider, system, messages, signal);
    case "ollama":
      return openOllamaStream(provider, system, messages, signal);
    default:
      throw new Error("Provider tidak mendukung streaming.");
  }
}

function localStatus(bundle: LocalAnalysisBundle | undefined, candidates: number): VerificationStatus {
  if (bundle) return bundle.status;
  if (candidates > 0) return "LIKELY";
  return "UNSOLVED";
}

export function generateLocalAssistantReply(input: {
  messages: AiChatMessage[];
  bundle?: LocalAnalysisBundle;
  mode: SessionMode;
  language: "id" | "en";
  extraEvidence?: Array<{ title: string; summary: string; detail: string; confidence: string }>;
}): string {
  const { bundle, mode, language } = input;
  if (bundle && bundle.files.length > 0) {
    const report = generateLocalReport(bundle, mode, language);
    return `${report}

---

> Catatan mesin: jawaban ini dihasilkan oleh **Local Analyst deterministik**, bukan LLM. Tidak ada API provider AI yang dipanggil. Semua output berasal dari parser dan perhitungan lokal atas data yang diunggah.`;
  }

  const lastUser = [...input.messages].reverse().find((message) => message.role === "user")?.content || "";
  const analysis = analyzeText(lastUser, bundle?.challenge.flagFormat);
  const isEnglish = language === "en";
  const terminalEvidence = (input.extraEvidence || []).filter((item) =>
    item.title.startsWith("Kali:"),
  );
  const terminalText = terminalEvidence.map((item) => item.detail).join("\n");
  const terminalAnalysis = terminalText
    ? analyzeText(terminalText, bundle?.challenge.flagFormat)
    : null;
  const candidates = [
    ...analysis.flagCandidates,
    ...(bundle?.flagCandidates || []),
    ...(terminalAnalysis?.flagCandidates || []),
  ];
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.value, candidate])).values()];
  let status = localStatus(
    bundle,
    analysis.flagCandidates.length + (terminalAnalysis?.flagCandidates.length || 0),
  );
  const expected = bundle?.challenge.expectedFlag;
  if (expected && uniqueCandidates.some((candidate) => candidate.value === expected)) {
    status = "VERIFIED";
  } else if (status === "UNSOLVED" && uniqueCandidates.length) {
    status = "LIKELY";
  }
  const showFlags = mode !== "hint";
  const statusLabels: Record<VerificationStatus, string> = {
    VERIFIED: isEnglish ? "VERIFIED — matches a locally supplied expected flag." : "VERIFIED — cocok dengan expected flag lokal.",
    LIKELY: isEnglish ? "LIKELY — strong candidate, not verified against the CTF server." : "LIKELY — kandidat kuat, belum diverifikasi ke server CTF.",
    INCOMPLETE: isEnglish ? "INCOMPLETE — clues exist but the evidence chain is unfinished." : "INCOMPLETE — petunjuk ada, rantai bukti belum lengkap.",
    UNSOLVED: isEnglish ? "UNSOLVED — no flag candidate yet." : "UNSOLVED — belum ada kandidat flag.",
  };
  const title = bundle?.challenge.title || (isEnglish ? "Text-only analysis" : "Analisis teks");
  const category = bundle?.category || analysis.category;
  const evidenceSummary = bundle
    ? `${bundle.files.length} file, ${bundle.evidence.length} bukti, ${bundle.toolRuns.length} operasi parser, ${terminalEvidence.length} perintah terminal Kali. ${bundle.summary}`
    : `${terminalEvidence.length} perintah terminal Kali. ${analysis.notes.join(" ") || (isEnglish ? "No attachment; analysis is based on the pasted text." : "Tidak ada lampiran; analisis berbasis teks yang ditempel.")}`;
  const decoded = analysis.decodedLayers.length
    ? analysis.decodedLayers
        .slice(0, 5)
        .map((layer, index) => `${index + 1}. \`${layer.operation}\` → \`${layer.value.slice(0, 300).replace(/\n/g, " ")}\``)
        .join("\n")
    : isEnglish
      ? "No additional encoding layer was detected."
      : "Tidak ada lapisan encoding tambahan yang terdeteksi.";
  const terminalSection = terminalEvidence.length
    ? `\n\n${
        isEnglish
          ? "Kali terminal output (actually executed):"
          : "Output terminal Kali (benar-benar dijalankan):"
      }\n\n${terminalEvidence
        .map((item) => `### ${item.title}\n${truncate(item.detail, 1500)}`)
        .join("\n\n")}`
    : "";

  if (isEnglish) {
    return `# CTF Intelligence — Local Analyst

> Engine: **Local Analyst (deterministic)**. No LLM provider was called. This response is generated from real local text analysis and stored evidence.

## 1. IDENTIFICATION

**Title:** ${title}  
**Category:** ${category} (heuristic confidence ${Math.round(analysis.categoryConfidence * 100)}%)  
**Flag format:** \`${analysis.flagFormat}\`

## 2. INITIAL ANALYSIS

${evidenceSummary}

Keywords: ${analysis.keywords.slice(0, 15).map((word) => `\`${word}\``).join(", ") || "—"}.

## 3. TOOLS

Actually executed: **text analyzer**, **encoding detector**, **flag extractor**, **frequency analysis**.  
Recommended but not executed: external CTF tools relevant to ${category}. No external binary was run.

## 4. STEPS

1. Confirm the challenge category and flag format.
2. Check attachments and metadata before aggressive decoding.
3. Decode suspected layers one at a time and validate the output.
4. Extract candidates, then verify against the expected flag or the CTF platform.
5. If evidence is missing, upload the original artifact for local parsing.

## 5. PROCESS

Detected encoding layers:

${decoded}
${terminalSection}

${analysis.notes.map((note) => `- ${note}`).join("\n") || "- No additional textual note."}

## 6. RESULT

${showFlags && uniqueCandidates.length
  ? uniqueCandidates.slice(0, 5).map((candidate) => `- \`${candidate.value}\` — ${candidate.source} (confidence ${candidate.confidence})`).join("\n")
  : mode === "hint"
    ? "Hint mode: flag values are intentionally hidden. Focus on the decoding layers and evidence above."
    : "No flag candidate passed extraction. This is not proof that the challenge is unsolvable."}

## 7. LEARNING

- Evidence from actual files is stronger than keyword guesses.
- Never trust an extension over the file signature.
- Decode iteratively and validate every layer.
- A candidate is not VERIFIED until it matches an expected flag or the CTF platform accepts it.

## 8. VERIFICATION STATUS

**${statusLabels[status]}**

> Limitations: this engine does not run uploaded binaries, does not call external CTF tools, and cannot verify a flag against a remote scoreboard.`;
  }

  return `# CTF Intelligence — Local Analyst

> Mesin: **Local Analyst (deterministik)**. Tidak ada provider LLM yang dipanggil. Jawaban ini dihasilkan dari analisis teks dan bukti lokal yang benar-benar tersimpan.

## 1. IDENTIFIKASI

**Judul:** ${title}  
**Kategori:** ${category} (keyakinan heuristik ${Math.round(analysis.categoryConfidence * 100)}%)  
**Format flag:** \`${analysis.flagFormat}\`

## 2. ANALISIS AWAL

${evidenceSummary}

Kata kunci: ${analysis.keywords.slice(0, 15).map((word) => `\`${word}\``).join(", ") || "—"}.

## 3. TOOLS

Benar-benar dijalankan: **text analyzer**, **encoding detector**, **flag extractor**, **frequency analysis**.  
Rekomendasi (belum dijalankan): tool eksternal relevan untuk kategori ${category}. Tidak ada binary eksternal yang dieksekusi.

## 4. LANGKAH

1. Pastikan kategori challenge dan format flag.
2. Periksa lampiran dan metadata sebelum decoding agresif.
3. Decode lapisan yang dicurigai satu per satu, lalu validasi outputnya.
4. Ekstrak kandidat, lalu verifikasi terhadap expected flag atau platform CTF.
5. Jika bukti kurang, unggah artefak asli agar parser lokal dapat menganalisisnya.

## 5. PROSES

Lapisan encoding yang terdeteksi:

${decoded}
${terminalSection}

${analysis.notes.map((note) => `- ${note}`).join("\n") || "- Tidak ada catatan tekstual tambahan."}

## 6. HASIL

${showFlags && uniqueCandidates.length
  ? uniqueCandidates.slice(0, 5).map((candidate) => `- \`${candidate.value}\` — ${candidate.source} (confidence ${candidate.confidence})`).join("\n")
  : mode === "hint"
    ? "Mode hint: nilai flag sengaja disembunyikan. Fokus pada lapisan decoding dan bukti di atas."
    : "Belum ada kandidat flag yang lolos ekstraksi. Ini bukan bukti bahwa challenge tidak bisa diselesaikan."}

## 7. PEMBELAJARAN

- Bukti dari file asli lebih kuat daripada tebakan kata kunci.
- Jangan percaya ekstensi; periksa signature file.
- Decode secara bertahap dan validasi setiap lapisan.
- Kandidat belum VERIFIED sampai cocok dengan expected flag atau diterima platform CTF.

## 8. STATUS VERIFIKASI

**${statusLabels[status]}**

> Batasan: mesin ini tidak menjalankan binary yang diunggah, tidak memanggil tool CTF eksternal, dan tidak dapat memverifikasi flag ke scoreboard jarak jauh.`;
}

function candidateProviders(settings: CtfSettings): ProviderId[] {
  const order: ProviderId[] = [];
  const push = (id: ProviderId) => {
    if (!order.includes(id)) order.push(id);
  };
  push(settings.ai.defaultProvider);
  for (const id of settings.ai.fallbackOrder) push(id);
  push("local");
  return order;
}

export async function* streamAssistant(input: {
  messages: AiChatMessage[];
  bundle?: LocalAnalysisBundle;
  settings?: CtfSettings;
  mode: SessionMode;
  language: "id" | "en";
  provider?: ProviderId;
  signal?: AbortSignal;
  extraEvidence?: Array<{ title: string; summary: string; detail: string; confidence: string }>;
  extraInstructions?: string;
}): AsyncGenerator<AssistantStreamEvent> {
  const settings = input.settings || (await getSettings());
  const custom = [settings.ai.customInstructions, input.extraInstructions]
    .filter((item) => item?.trim())
    .join("\n\n");
  const system = systemPrompt(input.mode, input.language, custom);
  const evidence = buildEvidenceContext(input.bundle, input.extraEvidence);
  const messages: AiChatMessage[] = [
    {
      role: "user",
      content: `KONTEKS BUKTI LOKAL (hanya gunakan ini; jangan mengarang di luar konteks):\n\n${evidence}\n\n---\n\nPERTANYAAN / PERINTAH PENGGUNA:\n${input.messages.at(-1)?.content || "Analisis challenge ini."}`,
    },
  ];
  const history = input.messages.slice(0, -1).slice(-8);
  const conversation = [...history, ...messages];
  const notes: string[] = [];
  const order = candidateProviders(settings);
  const providers = input.provider
    ? [input.provider, ...order.filter((id) => id !== input.provider)]
    : order;

  for (const id of providers) {
    if (id === "local") {
      yield { type: "meta", provider: "local", model: "deterministic-engine" };
      const reply = generateLocalAssistantReply({
        messages: input.messages,
        bundle: input.bundle,
        mode: input.mode,
        language: input.language,
        extraEvidence: input.extraEvidence,
      });
      for (let index = 0; index < reply.length; index += 220) {
        yield { type: "delta", text: reply.slice(index, index + 220) };
      }
      yield { type: "done", status: localStatus(input.bundle, input.bundle?.flagCandidates.length || 0) };
      return;
    }

    const resolved = await resolveProvider(id, settings.ai);
    if (!resolved || !providerAvailable(resolved)) {
      if (resolved) notes.push(`${resolved.label}: ${providerUnavailableReason(resolved)}`);
      continue;
    }
    try {
      const opened = await openProviderStream(resolved, system, conversation, input.signal);
      yield { type: "meta", provider: resolved.id, model: resolved.model };
      if (notes.length) {
        yield {
          type: "note",
          message: `Fallback provider: ${notes.join(" | ")}`,
        };
      }
      for await (const chunk of opened.stream) {
        yield { type: "delta", text: chunk };
      }
      yield { type: "done" };
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`${resolved.label}: ${message}`);
      if (input.signal?.aborted) {
        yield { type: "error", message: "Permintaan dibatalkan." };
        return;
      }
    }
  }

  yield {
    type: "error",
    message: `Semua provider AI gagal. ${notes.join(" | ")}`,
  };
}

export interface CompletionResult {
  provider: ProviderId;
  model: string;
  text: string;
}

/**
 * Non-streaming completion used by the Kali agent planner. Returns null when
 * no real LLM provider is available, so callers can fall back to the
 * deterministic tool plan instead of inventing commands.
 */
export async function completeText(input: {
  system: string;
  messages: AiChatMessage[];
  provider?: ProviderId;
  signal?: AbortSignal;
  maxChars?: number;
}): Promise<CompletionResult | null> {
  const settings = await getSettings();
  const order = candidateProviders(settings);
  const providers = input.provider
    ? [input.provider, ...order.filter((id) => id !== input.provider)]
    : order;
  const limit = input.maxChars || 8000;
  for (const id of providers) {
    if (id === "local") continue;
    const resolved = await resolveProvider(id, settings.ai);
    if (!resolved || !providerAvailable(resolved)) continue;
    try {
      const opened = await openProviderStream(
        resolved,
        input.system,
        input.messages,
        input.signal,
      );
      let text = "";
      for await (const chunk of opened.stream) {
        text += chunk;
        if (text.length >= limit) break;
      }
      if (text.trim()) {
        return { provider: resolved.id, model: resolved.model, text: text.slice(0, limit) };
      }
    } catch {
      // Try the next provider; the caller decides how to fall back.
    }
  }
  return null;
}
