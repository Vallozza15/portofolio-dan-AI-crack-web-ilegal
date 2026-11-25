import { randomUUID } from "node:crypto";
import { autoDecodeLayers, frequencyAnalysis } from "./crypto";
import { extractFlagCandidates, determineStatus, flagFormatFromCandidates } from "./flag";
import type {
  AnalyzeTextResult,
  Challenge,
  CtfCategory,
  Evidence,
  FileAnalysis,
  FlagCandidate,
  LocalAnalysisBundle,
  SessionMode,
  ToolRun,
  VerificationStatus,
} from "./types";

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

const CATEGORY_KEYWORDS: Record<CtfCategory, string[]> = {
  cryptography: ["cipher", "encrypt", "decrypt", "crypto", "base64", "base32", "xor", "rsa", "aes", "hash", "morse", "rot13", "vigenere", "caesar", "frequency", "ciphertext", "plaintext", "key", "nonce", "signature", "encoding"],
  forensics: ["pcap", "packet", "wireshark", "memory", "dump", "exif", "metadata", "deleted", "carve", "timeline", "disk", "filesystem", "volatility", "forensic", "log", "event", "registry", "browser history", "recover"],
  steganography: ["stego", "steganography", "hidden", "lsb", "spectrogram", "audio", "wav", "png", "jpeg", "image", "zsteg", "steghide", "binwalk", "embedded", "pixel", "cover"],
  web: ["http", "https", "cookie", "sql", "sqli", "xss", "csrf", "ssrf", "url", "web", "login", "admin", "jwt", "header", "api", "request", "response", "session", "auth", "redirect", "path traversal", "lfi", "rfi"],
  reverse: ["reverse", "elf", "pe", "binary", "disassemble", "ghidra", "radare", "assembly", "function", "bytecode", "decompile", "upx", "packed", "obfuscated", "apk", "dex", "python", "javascript"],
  binary: ["buffer overflow", "pwn", "rop", "shellcode", "gdb", "stack", "heap", "canary", "nx", "pie", "libc", "ret2", "exploit", "payload", "overflow", "format string", "use after free"],
  osint: ["username", "domain", "dns", "whois", "social", "email", "geolocation", "public", "search", "recon", "osint", "certificate", "subdomain", "metadata", "location"],
  misc: ["qr", "barcode", "unicode", "archive", "zip", "math", "puzzle", "encoding", "convert", "pattern", "misc", "unknown"],
};

const TOOL_SUGGESTIONS: Record<CtfCategory, string[]> = {
  cryptography: ["Encoding detector", "Caesar / ROT brute force", "XOR analyzer", "Frequency analysis", "Hash identifier", "RSA math", "AES educational decrypt"],
  forensics: ["File signature", "Strings", "Hex preview", "EXIF", "ZIP/TAR listing", "PCAP parser", "Entropy", "Embedded file scan"],
  steganography: ["PNG LSB", "PNG chunks", "WAV LSB", "EXIF", "Embedded archive", "Audio spectrogram", "QR decoder"],
  web: ["HTTP request inspector", "Cookie/header audit", "HTML/JS analyzer", "JWT decoder", "Authorized HTTP fetch"],
  reverse: ["PE/ELF headers", "Sections & entropy", "Imports", "Strings", "Security mitigations", "Basic gadgets", "JS deobfuscator"],
  binary: ["Checksec", "Dangerous imports", "Gadget scan", "Strings", "Symbols", "GDB notes"],
  osint: ["DNS lookup", "TLS certificate", "Domain HTTP headers", "Username profile URLs", "Image metadata"],
  misc: ["QR decoder", "Archive inspector", "Unicode inspector", "Encoding tools", "Hex preview"],
};

export function detectCategory(text: string, files: FileAnalysis[] = []): { category: CtfCategory; confidence: number; scores: Record<CtfCategory, number> } {
  const lower = text.toLowerCase();
  const scores = Object.fromEntries(
    (Object.keys(CATEGORY_KEYWORDS) as CtfCategory[]).map((category) => [category, 0]),
  ) as Record<CtfCategory, number>;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[CtfCategory, string[]]>) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) scores[category] += 2;
    }
  }
  for (const file of files) {
    for (const hint of file.categoryHints) scores[hint] += 4;
    if (file.executable) {
      scores.reverse += 8;
      scores.binary += 6;
    }
    if (file.pcap) scores.forensics += 10;
    if (file.pdf) scores.forensics += 4;
    if (file.archive) scores.misc += 3;
    if (file.image) scores.steganography += 4;
    if (file.audio) scores.steganography += 5;
    if (file.stego.some((finding) => finding.confidence === "high")) scores.steganography += 3;
  }
  const sorted = (Object.entries(scores) as Array<[CtfCategory, number]>).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) {
    return { category: "misc", confidence: 0, scores };
  }
  return {
    category: sorted[0][0],
    confidence: Number((sorted[0][1] / total).toFixed(2)),
    scores,
  };
}

export function detectFlagFormat(text: string, fallback = "flag{...}") {
  const explicit = text.match(/(?:flag\s*format|format\s*flag|format)\s*[:\-]\s*([A-Za-z0-9_]{2,30}\{[^}\n]{0,60}\})/i);
  if (explicit) return explicit[1];
  const candidate = extractFlagCandidates(text)[0];
  if (candidate) return `${candidate.format}{...}`;
  return fallback;
}

export function analyzeText(text: string, customFormat?: string): AnalyzeTextResult {
  const category = detectCategory(text);
  const flagFormat = detectFlagFormat(text, customFormat || "flag{...}");
  const rawFlags = extractFlagCandidates(text, "challenge description", customFormat);
  const layers = autoDecodeLayers(text, 5);
  const decodedLayers = layers.map((layer) => ({
    operation: layer.path.join(" → "),
    value: layer.value.slice(0, 12_000),
    flagCandidates: extractFlagCandidates(layer.value, `decoded layer ${layer.path.join(" → ")}`, customFormat),
  }));
  const allFlags = new Map<string, FlagCandidate>();
  for (const candidate of [...rawFlags, ...decodedLayers.flatMap((layer) => layer.flagCandidates)]) {
    const existing = allFlags.get(candidate.value);
    if (!existing || existing.confidence < candidate.confidence) allFlags.set(candidate.value, candidate);
  }
  const flagCandidates = [...allFlags.values()].sort((a, b) => b.confidence - a.confidence);
  const keywords = [...new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9_./-]{3,}/g) || [])
      .filter((word) => !["this", "that", "with", "from", "have", "your", "flag", "challenge", "file"].includes(word))
      .slice(0, 40),
  )];
  const notes: string[] = [];
  if (layers.length) notes.push(`${layers.length} lapisan encoding terdeteksi secara otomatis.`);
  if (flagCandidates.length) notes.push(`${flagCandidates.length} kandidat flag ditemukan pada deskripsi atau hasil decode.`);
  if (!text.trim()) notes.push("Deskripsi challenge kosong; analisis mengandalkan file lampiran.");
  if (/\b(?:http|https):\/\//i.test(text)) notes.push("Challenge menyebut URL — periksa header, cookie, dan source secara terkontrol.");
  if (/\b(?:pcap|memory dump|disk image)\b/i.test(text)) notes.push("Challenge menyebut artefak forensik — unggah file asli untuk analisis.");

  return {
    category: category.category,
    categoryConfidence: category.confidence,
    keywords,
    flagFormat,
    flagCandidates,
    decodedLayers,
    frequency: frequencyAnalysis(text),
    notes,
    status: determineStatus(flagCandidates, undefined),
  };
}

function evidenceForFile(file: FileAnalysis, challengeId?: string): Evidence[] {
  const evidence: Evidence[] = [];
  const push = (title: string, summary: string, detail: string, confidence: Evidence["confidence"]) => {
    evidence.push({
      id: id("ev"),
      challengeId,
      fileId: file.fileId,
      kind: "file",
      title,
      summary,
      detail,
      confidence,
      createdAt: new Date().toISOString(),
    });
  };
  push(
    "Identitas file",
    `${file.name} — ${file.magic}, ${file.size} byte`,
    `SHA-256: ${file.sha256}\nMD5: ${file.md5}\nSHA-1: ${file.sha1}\nEntropy: ${file.entropy} bit/byte\nKategori: ${file.categoryHints.join(", ")}`,
    "high",
  );
  if (file.strings.length) {
    push(
      "String menarik",
      `${file.stringCount} string terekstrak; ${file.strings.filter((value) => /flag|secret|key|pass|http|admin/i.test(value)).length} cocok kata kunci sensitif`,
      file.strings.slice(0, 30).join("\n"),
      "medium",
    );
  }
  for (const finding of file.stego.filter((item) => item.confidence !== "low").slice(0, 8)) {
    push(finding.technique, finding.detail, finding.output || finding.detail, finding.confidence);
  }
  if (file.archive) {
    push(
      "Struktur arsip",
      `${file.archive.format}: ${file.archive.entries.length} entry`,
      file.archive.entries.slice(0, 40).map((entry) => `${entry.name} (${entry.compression}, ${entry.uncompressedSize} B${entry.encrypted ? ", encrypted" : ""})`).join("\n"),
      "high",
    );
  }
  if (file.image) {
    push("Metadata gambar", `${file.image.format} ${file.image.width || "?"}×${file.image.height || "?"}`, JSON.stringify(file.image, null, 2).slice(0, 4000), "medium");
  }
  if (file.pcap) {
    push(
      "Ringkasan PCAP",
      `${file.pcap.packetCount} paket, ${Object.entries(file.pcap.protocols).map(([key, value]) => `${key}:${value}`).join(", ")}`,
      JSON.stringify({ dns: file.pcap.dnsQueries, hosts: file.pcap.httpHosts, requests: file.pcap.httpRequests, credentials: file.pcap.credentials, interesting: file.pcap.interestingStrings }, null, 2).slice(0, 5000),
      "high",
    );
  }
  if (file.executable) {
    push(
      "Properti executable",
      `${file.executable.format} ${file.executable.architecture} ${file.executable.bits}-bit`,
      `${file.executable.security.map((item) => `${item.name}: ${item.enabled === null ? "unknown" : item.enabled ? "ON" : "OFF"}`).join("\n")}\n\nSections: ${file.executable.sections.map((section) => `${section.name}(entropy ${section.entropy})`).join(", ")}`,
      "high",
    );
  }
  if (file.flagCandidates.length) {
    for (const candidate of file.flagCandidates.slice(0, 5)) {
      push("Kandidat flag", candidate.value, `Sumber: ${candidate.source}\nKepercayaan: ${candidate.confidence}`, candidate.confidence >= 0.8 ? "high" : "medium");
    }
  }
  return evidence;
}

function toolRunsForFile(file: FileAnalysis): ToolRun[] {
  const at = new Date().toISOString();
  const tools: Array<[string, string]> = [
    ["file-signature", `Magic: ${file.magic}`],
    ["hash", `SHA-256 ${file.sha256.slice(0, 16)}…`],
    ["entropy", `${file.entropy} bit/byte`],
    ["strings", `${file.stringCount} string`],
    ["hex-preview", `${file.hexPreview.split("\n").length} baris`],
  ];
  if (file.image) tools.push(["image-metadata", `${file.image.format}`]);
  if (file.archive) tools.push(["archive-inspector", `${file.archive.entries.length} entry`]);
  if (file.pcap) tools.push(["pcap-parser", `${file.pcap.packetCount} paket`]);
  if (file.executable) tools.push(["executable-parser", `${file.executable.format}`]);
  if (file.pdf) tools.push(["pdf-parser", `${file.pdf.pages} halaman`]);
  if (file.stego.length) tools.push(["stego-scan", `${file.stego.length} temuan`]);
  return tools.map(([tool, summary]) => ({
    id: id("tool"),
    fileId: file.fileId,
    tool,
    args: [file.name],
    status: "ok",
    summary,
    durationMs: file.durationMs,
    createdAt: at,
  }));
}

export function buildLocalBundle(input: {
  challenge: Challenge;
  files: FileAnalysis[];
  customFormat?: string;
  message?: string;
}): LocalAnalysisBundle {
  const analyzedText = [input.challenge.title, input.challenge.description, input.message]
    .filter((part) => part && String(part).trim())
    .join("\n");
  const text = analyzeText(analyzedText, input.customFormat || input.challenge.flagFormat);
  const allFlags = new Map<string, FlagCandidate>();
  for (const candidate of [...text.flagCandidates, ...input.files.flatMap((file) => file.flagCandidates)]) {
    const existing = allFlags.get(candidate.value);
    if (!existing || existing.confidence < candidate.confidence) allFlags.set(candidate.value, candidate);
  }
  const flagCandidates = [...allFlags.values()].sort((a, b) => b.confidence - a.confidence);
  const status = determineStatus(flagCandidates, input.challenge.expectedFlag);
  const evidence = [
    ...input.files.flatMap((file) => evidenceForFile(file, input.challenge.id)),
    ...(text.flagCandidates.length
      ? [{
          id: id("ev"),
          challengeId: input.challenge.id,
          kind: "text",
          title: "Kandidat flag dari deskripsi",
          summary: text.flagCandidates.map((candidate) => candidate.value).join(", "),
          detail: `Format terdeteksi: ${text.flagFormat}\nKategori: ${text.category}`,
          confidence: "medium" as const,
          createdAt: new Date().toISOString(),
        }]
      : []),
  ];
  const toolRuns = [
    ...input.files.flatMap(toolRunsForFile),
    {
      id: id("tool"),
      tool: "category-detector",
      args: [input.challenge.title],
      status: "ok" as const,
      summary: `Kategori ${text.category} (confidence ${text.categoryConfidence})`,
      durationMs: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: id("tool"),
      tool: "auto-decode",
      args: ["challenge text"],
      status: "ok" as const,
      summary: `${text.decodedLayers.length} lapisan decoding`,
      durationMs: 0,
      createdAt: new Date().toISOString(),
    },
  ];
  const category = text.category;
  const summary = flagCandidates.length
    ? `Ditemukan ${flagCandidates.length} kandidat flag. Terbaik: ${flagCandidates[0].value}`
    : `Belum ada flag yang tervalidasi. ${input.files.length} file dan deskripsi telah dianalisis.`;

  return {
    challenge: input.challenge,
    files: input.files,
    text,
    evidence,
    flagCandidates,
    toolRuns,
    status,
    recommendedTools: TOOL_SUGGESTIONS[category],
    category,
    title: input.challenge.title,
    summary,
  };
}

function verificationLabel(status: VerificationStatus) {
  const labels: Record<VerificationStatus, string> = {
    VERIFIED: "VERIFIED — cocok dengan expected flag lokal",
    LIKELY: "LIKELY — kandidat kuat, belum divalidasi ke server CTF",
    INCOMPLETE: "INCOMPLETE — ada petunjuk/kandidat lemah, perlu langkah tambahan",
    UNSOLVED: "UNSOLVED — belum ada kandidat flag",
  };
  return labels[status];
}

function hintsFor(bundle: LocalAnalysisBundle) {
  const hints: string[] = [];
  if (bundle.files.some((file) => file.archive)) hints.push("Mulai dari struktur arsip: periksa nama entry, komentar, dan file yang tidak terlihat di UI.");
  if (bundle.files.some((file) => file.image)) hints.push("Periksa chunk/metadata gambar terlebih dahulu, lalu bandingkan dengan LSB atau data setelah akhir file.");
  if (bundle.files.some((file) => file.audio)) hints.push("Lihat spektrogram audio; pesan sering muncul sebagai pola frekuensi, bukan teks biasa.");
  if (bundle.files.some((file) => file.pcap)) hints.push("Filter percakapan berdasarkan protokol, lalu cari request HTTP, DNS, dan kredensial.");
  if (bundle.files.some((file) => file.executable)) hints.push("Fokus pada string, import sensitif, dan mitigasi keamanan sebelum menyentuh disassembler.");
  if (bundle.text.decodedLayers.length) hints.push("Gunakan hasil auto-decode sebagai petunjuk; perhatikan lapisan mana yang menghasilkan teks bermakna.");
  if (bundle.flagCandidates.length) hints.push("Kandidat flag sudah muncul. Verifikasi format, kapitalisasi, dan apakah ada karakter terpotong.");
  if (!hints.length) hints.push("Unggah lampiran asli atau tempel deskripsi lengkap; analisis saat ini hanya berbasis teks.");
  return hints.slice(0, 5);
}

export function generateLocalReport(bundle: LocalAnalysisBundle, mode: SessionMode = "learning", language: "id" | "en" = "id") {
  const isEnglish = language === "en";
  const cat = bundle.category;
  const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
  const date = new Date().toLocaleString(isEnglish ? "en-US" : "id-ID");
  const fileRows = bundle.files.length
    ? bundle.files.map((file) => `| \`${file.name}\` | ${file.magic} | ${file.size} B | ${file.entropy} | \`${file.sha256.slice(0, 16)}…\` |`).join("\n")
    : "| — | Tidak ada lampiran | — | — | — |";
  const evidenceRows = bundle.evidence.length
    ? bundle.evidence.slice(0, 24).map((item) => `| ${item.title} | ${item.summary.replace(/\|/g, "\\|")} | ${item.confidence} |`).join("\n")
    : "| — | Tidak ada bukti yang tercatat | — |";
  const toolRows = bundle.toolRuns.length
    ? bundle.toolRuns.slice(0, 30).map((run) => `| \`${run.tool}\` | ${run.args.join(" ")} | ${run.status} | ${run.summary.replace(/\|/g, "\\|")} |`).join("\n")
    : "| — | — | — | — |";
  const flagSection = bundle.flagCandidates.length
    ? bundle.flagCandidates.slice(0, 8).map((candidate) => `- \`${candidate.value}\` — ${candidate.source} (confidence ${candidate.confidence})`).join("\n")
    : "Tidak ada kandidat flag yang lolos ekstraksi. Ini bukan klaim bahwa challenge tidak memiliki solusi; analisis tambahan diperlukan.";
  const findings = bundle.files.length
    ? bundle.files.flatMap((file) => [
        `- **${file.name}** — ${file.magic}, entropy ${file.entropy}. ${file.warnings[0] || "Tidak ada peringatan kritis."}`,
        ...file.stego.filter((item) => item.confidence !== "low").slice(0, 3).map((item) => `  - ${item.technique}: ${item.detail}`),
      ]).join("\n")
    : "- Tidak ada file yang diunggah. Analisis hanya membaca deskripsi dan pola encoding pada teks.";
  const hints = hintsFor(bundle);
  const decoded = bundle.text.decodedLayers.length
    ? bundle.text.decodedLayers.slice(0, 5).map((layer, index) => `### Lapisan ${index + 1} — \`${layer.operation}\`\n\`\`\`\n${layer.value.slice(0, 1200)}\n\`\`\``).join("\n\n")
    : "Tidak ada lapisan encoding tambahan yang terdeteksi pada deskripsi challenge.";

  if (mode === "hint") {
    return `# Petunjuk Bertahap — ${bundle.title}

> Status: **${verificationLabel(bundle.status)}**
> Kategori: **${catLabel}** · Mode: **Hint** · ${date}

## Petunjuk 1 — Orientasi
${hints[0] || "Baca ulang deskripsi dan tentukan kategori berdasarkan kata kunci."}

## Petunjuk 2 — Arah Investigasi
${hints[1] || "Periksa metadata dan string sebelum mencoba decoding agresif."}

## Petunjuk 3 — Verifikasi
${hints[2] || "Setelah menemukan kandidat, validasi format dan konteksnya. Jangan langsung menganggapnya benar."}

## Yang Sudah Ditemukan
${findings}

## Catatan
Mode hint sengaja tidak menampilkan flag final secara langsung. Ubah mode ke **Learning** atau **Expert** setelah Anda ingin melihat pembahasan lengkap. Analisis ini deterministik dan tidak mengarang eksekusi.
`;
  }

  return `# Laporan Analisis — ${bundle.title}

> Status: **${verificationLabel(bundle.status)}**
> Kategori: **${catLabel}** · Mode: **${mode}** · Bahasa: **${isEnglish ? "English" : "Indonesia"}** · ${date}
> Mesin: **Local Analyst (deterministik)** — bukan LLM. Setiap temuan di bawah berasal dari operasi yang benar-benar dijalankan pada data yang diunggah.

## 1. IDENTIFIKASI TANTANGAN

**Judul:** ${bundle.title}  
**Kategori:** ${catLabel} (keyakinan heuristik ${Math.round(bundle.text.categoryConfidence * 100)}%)  
**Format flag:** \`${bundle.text.flagFormat}\`  
**Deskripsi:** ${bundle.challenge.description ? bundle.challenge.description.slice(0, 1200) : "Tidak ada deskripsi."}

Kata kunci yang terdeteksi: ${bundle.text.keywords.slice(0, 18).map((word) => `\`${word}\``).join(", ") || "—"}.

## 2. ANALISIS AWAL

| File | Tipe terdeteksi | Ukuran | Entropy | SHA-256 |
| --- | --- | --- | --- | --- |
${fileRows}

Temuan awal:

${findings}

Bukti terstruktur yang tersimpan:

| Bukti | Ringkasan | Keyakinan |
| --- | --- | --- |
${evidenceRows}

## 3. TOOLS YANG DIGUNAKAN

| Tool | Argumen | Status | Ringkasan |
| --- | --- | --- | --- |
${toolRows}

Tool yang direkomendasikan untuk kategori ini: ${bundle.recommendedTools.map((tool) => `\`${tool}\``).join(", ")}.

## 4. LANGKAH PENYELESAIAN

### Langkah 1 — Identifikasi tipe file
- **Tujuan:** Memastikan file sesuai dengan ekstensinya dan menemukan signature tersembunyi.
- **Operasi:** Pembacaan magic bytes, hash SHA-256/MD5/SHA-1, dan entropy.
- **Penjelasan:** Ekstensi bisa dimanipulasi. Signature internal adalah bukti yang lebih kuat.
- **Output yang diharapkan:** Nama format, ukuran, hash, dan indikasi kompresi/enkripsi.
- **Temuan aktual:** ${bundle.files.length ? bundle.files.map((file) => `${file.name} → ${file.magic}`).join("; ") : "Tidak ada file; langkah ini dilewati."}

### Langkah 2 — Ekstraksi string dan metadata
- **Tujuan:** Menemukan petunjuk, URL, kredensial, nama fungsi, atau potongan flag.
- **Operasi:** Ekstraksi string ASCII/UTF-16, metadata gambar/audio, dan parser format.
- **Penjelasan:** Banyak challenge pemula menyembunyikan flag di metadata atau string yang tidak terlihat di UI.
- **Output yang diharapkan:** String sensitif atau metadata mencurigakan.
- **Temuan aktual:** ${bundle.files.length ? `${bundle.files.reduce((sum, file) => sum + file.stringCount, 0)} string terekstrak; ${bundle.files.reduce((sum, file) => sum + file.stego.length, 0)} temuan stego/metadata.` : "Tidak ada file."}

### Langkah 3 — Deteksi lapisan encoding
- **Tujuan:** Mengurai data yang mungkin di-encode berlapis.
- **Operasi:** Deteksi Base64/Base32/Base58/hex/binary/URL/Morse dan decoding bertahap (maksimal 5 lapisan).
- **Penjelasan:** Setiap lapisan harus menghasilkan teks yang masuk akal; decoding buta dapat menghasilkan sampah.
- **Output yang diharapkan:** Teks bermakna atau kandidat flag.
- **Temuan aktual:** ${bundle.text.decodedLayers.length ? `${bundle.text.decodedLayers.length} lapisan ditemukan.` : "Tidak ada lapisan tambahan pada teks challenge."}

${decoded}

### Langkah 4 — Analisis khusus kategori
- **Tujuan:** Menjalankan pemeriksaan yang relevan tanpa menjalankan semua tool secara berlebihan.
- **Operasi:** ${bundle.recommendedTools.join(", ")}.
- **Penjelasan:** Tool dipilih berdasarkan bukti tipe file dan kata kunci, bukan daftar tetap.
- **Output yang diharapkan:** Artefak tersembunyi, struktur arsip, packet flow, properti binary, atau flag.
- **Temuan aktual:** ${bundle.summary}

### Langkah 5 — Validasi kandidat
- **Tujuan:** Memisahkan flag yang benar dari string yang kebetulan mirip.
- **Operasi:** Pencocokan format, pencarian berulang di beberapa sumber, dan perbandingan dengan expected flag bila tersedia.
- **Penjelasan:** Status VERIFIED hanya diberikan jika kandidat cocok dengan expected flag yang Anda tetapkan. Jika tidak, status maksimal LIKELY.
- **Output yang diharapkan:** Satu kandidat dengan bukti yang bisa dilacak.
- **Temuan aktual:** ${flagSection}

## 5. PROSES PEMECAHAN

${bundle.flagCandidates.length
  ? `Kandidat terkuat adalah \`${bundle.flagCandidates[0].value}\`, berasal dari **${bundle.flagCandidates[0].source}** dengan confidence ${bundle.flagCandidates[0].confidence}. Nilai ini muncul setelah operasi yang tercatat di atas. ${bundle.challenge.expectedFlag ? "Kandidat dibandingkan dengan expected flag challenge." : "Tidak ada expected flag yang ditetapkan, sehingga status tidak dapat mencapai VERIFIED hanya dari analisis lokal."}`
  : "Belum ada rantai bukti yang berujung pada flag. Analisis saat ini menghasilkan petunjuk, bukan solusi. Jangan mengarang flag; lanjutkan dengan tool yang direkomendasikan atau unggah artefak tambahan."}

## 6. HASIL AKHIR

${bundle.flagCandidates.length
  ? bundle.flagCandidates.slice(0, 5).map((candidate) => `**Kandidat:** \`${candidate.value}\`\n\n- Sumber: ${candidate.source}\n- Confidence: ${candidate.confidence}\n- Format: ${candidate.format}{...}`).join("\n\n")
  : "**Tidak ada flag terverifikasi.** Status: UNSOLVED/INCOMPLETE. Gunakan petunjuk di bawah untuk melanjutkan."}

## 7. PEMBELAJARAN

- **Verifikasi tipe file** lebih penting daripada mempercayai ekstensi.
- **Hash** memberi identitas file yang stabil; **entropy** membantu mendeteksi kompresi/enkripsi.
- **Metadata dan string** adalah sumber bukti murah sebelum analisis berat.
- **Decoding berlapis** harus disertai validasi output; jangan berhenti pada lapisan pertama.
- **Kategori menentukan tool**, tetapi bukti file selalu mengalahkan tebakan dari kata kunci.
- **Flag harus divalidasi** terhadap format dan, jika tersedia, expected flag. Analisis lokal bukan pengganti verifikasi server CTF.

## 8. STATUS VERIFIKASI

**${verificationLabel(bundle.status)}**

${bundle.challenge.expectedFlag
  ? `Expected flag lokal: \`${bundle.challenge.expectedFlag}\`. Perbandingan dilakukan secara eksak.`
  : "Challenge ini tidak memiliki expected flag. Untuk mencapai VERIFIED, tambahkan expected flag pada metadata challenge atau validasi kandidat ke platform CTF asal."}

### Petunjuk lanjutan
${hints.map((hint, index) => `${index + 1}. ${hint}`).join("\n")}

### Batasan
- Analisis ini tidak menjalankan file yang diunggah.
- Parser bawaan tidak menggantikan Ghidra, Wireshark, Volatility, zsteg, atau tools khusus lainnya.
- Tool eksternal hanya muncul sebagai tersedia jika benar-benar terdeteksi di sistem.
`;
}

export function formatFlagForDisplay(candidates: FlagCandidate[]) {
  return candidates.length ? flagFormatFromCandidates(candidates) : "flag{...}";
}
