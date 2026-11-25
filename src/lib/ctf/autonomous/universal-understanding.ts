import type { ChallengeCategory } from "./challenge-category";
import {
  detectPicoctfCategory,
  picoctfCategoryLabel,
  picoctfCategoryMapping,
  type PicoctfCategory,
} from "../picoctf/categories";

/**
 * Evidence-driven challenge understanding.
 *
 * Classification is a score over several independent evidence channels, not a
 * first-keyword-wins lookup. Fields that are not present in the supplied
 * evidence stay absent and are listed in `missingInformation`; nothing is
 * guessed.
 */
export type EvidenceKind =
  | "title"
  | "description"
  | "hint"
  | "filename"
  | "filetype"
  | "source"
  | "terminal-output"
  | "metadata";

export interface ChallengeEvidenceItem {
  kind: EvidenceKind;
  value: string;
  label?: string;
}

export interface ChallengeUnderstandingInput {
  title?: string;
  description?: string;
  hints?: string[];
  instructions?: string[];
  files?: Array<{ name: string; mimeType?: string; detectedType?: string }>;
  terminalOutputs?: string[];
  sourceCode?: string[];
  metadata?: string[];
}

export interface ClassificationSignal {
  category: ChallengeCategory;
  signal: string;
  evidence: string;
  weight: number;
}

export interface ChallengeUnderstanding {
  title?: string;
  description?: string;
  category: ChallengeCategory;
  /** Explicit picoCTF category label when present in the supplied evidence. */
  platformCategory?: string;
  platformCategoryLabel?: string;
  confidence: number;
  classificationEvidence: ClassificationSignal[];
  difficulty?: string;
  files: Array<{ name: string; type?: string }>;
  flagFormat?: string;
  hints: string[];
  requiredTools: string[];
  possibleApproaches: string[];
  validationRequirements: string[];
  missingInformation: string[];
}

interface Rule {
  category: ChallengeCategory;
  strategy: string;
  approach: string;
  tools: string[];
  pattern: RegExp;
  weight: number;
}

const FILE_RULES: Rule[] = [
  {
    category: "network-analysis",
    strategy: "Analisis trafik dengan tshark/Wireshark, lalu telusuri protokol dan payload.",
    approach: "Baca file tangkapan paket dan ekstrak string/objek yang relevan.",
    tools: ["tshark", "tcpdump"],
    pattern: /\.(pcap|pcapng|cap)$/i,
    weight: 6,
  },
  {
    category: "steganography",
    strategy: "Periksa metadata dan bit tersembunyi pada media dengan tool stego Kali.",
    approach: "Uji metadata, LSB, dan container tersembunyi pada file media.",
    tools: ["exiftool", "zsteg", "steghide", "pngcheck", "binwalk"],
    pattern: /\.(png|jpe?g|gif|bmp|wav|mp3|flac|webp)$/i,
    weight: 3,
  },
  {
    category: "reverse-engineering",
    strategy: "Identifikasi biner, disassemble, dan telusuri logika validasi.",
    approach: "Periksa format biner dan dekompilasi fungsi utama.",
    tools: ["file", "readelf", "objdump", "r2", "ghidra", "gdb"],
    pattern: /\.(exe|dll|so|dylib|elf|o|class|jar|apk|pyc)$/i,
    weight: 5,
  },
  {
    category: "binary-exploitation",
    strategy: "Periksa proteksi biner dan uji kerentanan hanya di lingkungan challenge.",
    approach: "Uji proteksi stack/heap sebelum merancang exploit.",
    tools: ["checksec", "gdb", "r2", "python3"],
    pattern: /\.(c|cc|cpp|h|hpp)$/i,
    weight: 1,
  },
  {
    category: "programming",
    strategy: "Pahami kontrak input/output, tulis solver kecil, lalu jalankan di Kali.",
    approach: "Terjemahkan aturan soal menjadi program dan jalankan pada input yang diberikan.",
    tools: ["python3", "gcc", "g++", "node"],
    pattern: /\.(py|js|ts|rb|pl|go|rs|java|sh)$/i,
    weight: 3,
  },
  {
    category: "digital-forensics",
    strategy: "Periksa header, string, dan artefak tersembunyi sebelum menyimpulkan.",
    approach: "Carve file dan telusuri jejak aktivitas pada artefak.",
    tools: ["file", "strings", "xxd", "binwalk", "foremost", "exiftool"],
    pattern: /\.(zip|tar|gz|tgz|7z|iso|img|raw|mem|log|db|sqlite3?|evtx|jsonl)$/i,
    weight: 2,
  },
  {
    category: "web-security",
    strategy: "Analisis respons HTTP, parameter, dan endpoint sebelum menguji teknik web.",
    approach: "Periksa permintaan/respons dan perilaku parameter.",
    tools: ["curl", "python3"],
    pattern: /\.(html?|php|jsp|aspx?)$/i,
    weight: 3,
  },
];

const CONTENT_RULES: Rule[] = [
  {
    category: "binary-exploitation",
    strategy: "Gunakan hasil checksec untuk memilih teknik exploit yang sesuai.",
    approach: "Analisis proteksi biner lalu uji jalur kerentanan yang didukung bukti.",
    tools: ["checksec", "gdb", "python3"],
    pattern: /\b(canary found|nx enabled|pie enabled|relro\s*:|stack canary|format string|rop chain|ret2libc)\b/i,
    weight: 7,
  },
  {
    category: "reverse-engineering",
    strategy: "Telusuri logika validasi pada disassembly/dekompilasi biner.",
    approach: "Cari fungsi pembanding flag dan ekstrak konstantanya.",
    tools: ["file", "r2", "ghidra", "objdump", "gdb"],
    pattern: /\b(elf\s+\d+-bit|pe32\+?|mach-o|disassembly|decompil|symtab|section\s+\.text|gdb-peda|radare2)\b/i,
    weight: 6,
  },
  {
    category: "network-analysis",
    strategy: "Ekstrak konversi protokol dan payload dari hasil tangkapan.",
    approach: "Ikuti stream protokol dan ekstrak data yang terkirim.",
    tools: ["tshark", "tcpdump", "python3"],
    pattern: /\b(no\.|time\s+source\s+destination|frame\s+length|tcp\.srcport|http\.request|dns\.qry|follow\s+tcp\s+stream)\b/i,
    weight: 6,
  },
  {
    category: "steganography",
    strategy: "Uji lapisan bit dan metadata media sesuai petunjuk yang teramati.",
    approach: "Periksa LSB, metadata, dan payload tersembunyi pada media.",
    tools: ["zsteg", "steghide", "exiftool", "binwalk", "pngcheck"],
    pattern: /\b(lsb|steghide|zsteg|least significant bit|hidden\s+(?:in|data|message)|pngcheck|exif\s+tool)\b/i,
    weight: 5,
  },
  {
    category: "digital-forensics",
    strategy: "Rekonstruksi artefak dari sisa data dan metadata yang ditemukan.",
    approach: "Carve data dan korelasikan timeline artefak.",
    tools: ["binwalk", "foremost", "vol", "fls", "exiftool", "strings"],
    pattern: /\b(deleted file|unallocated|mft|inode|volatility|memory dump|carv|timeline|registry hive)\b/i,
    weight: 5,
  },
  {
    category: "web-security",
    strategy: "Uji perilaku aplikasi web melalui permintaan yang sah pada target challenge.",
    approach: "Bandingkan respons normal dan respons setelah perubahan parameter.",
    tools: ["curl", "python3"],
    pattern: /\b(http\/1\.[01]|set-cookie:|content-type:\s*text\/html|<script|<form|<php|sql\s+syntax|jwt|csrf)\b/i,
    weight: 4,
  },
  {
    category: "cryptography",
    strategy: "Identifikasi skema encoding/cipher dari bentuk data, lalu dekode dan verifikasi.",
    approach: "Uji dekode bertingkat sesuai bentuk data yang teramati.",
    tools: ["python3", "base64", "xxd", "openssl"],
    pattern: /\b(base64|base32|rot13|rot47|caesar|vigenere|xor|one-time pad|aes-|rsa|sha256|md5|ciphertext)\b/i,
    weight: 4,
  },
  {
    category: "osint",
    strategy: "Kumpulkan fakta publik yang dapat diverifikasi lalu korelasikan dengan hint.",
    approach: "Telusuri jejak publik yang relevan tanpa mengakses data privat.",
    tools: ["curl", "dig", "whois"],
    pattern: /\b(whois|rdap|google dork|social media|username|email address|public record)\b/i,
    weight: 4,
  },
  {
    category: "programming",
    strategy: "Turunkan aturan soal menjadi algoritma dan jalankan pada input nyata.",
    approach: "Buat solver kecil dan uji dengan contoh input/output.",
    tools: ["python3", "gcc", "node"],
    pattern: /\b(stdin|stdout|input\s*:\s*|output\s*:\s*|expected output|time limit|function signature)\b/i,
    weight: 4,
  },
];

const TEXT_RULES: Rule[] = [
  {
    category: "cryptography",
    strategy: "Identifikasi encoding/cipher dari teks, lalu uji dekode yang sesuai.",
    approach: "Uji dekode bertingkat dan verifikasi hasil dari output nyata.",
    tools: ["python3", "base64", "xxd"],
    pattern: /\b(kripto|crypto|cipher|chiper|xor|rot13|rot47|caesar|base64|base32|hex|vigenere|enkripsi|dekode|decode|encrypt|decrypt)\b/i,
    weight: 2,
  },
  {
    category: "steganography",
    strategy: "Periksa media dan metadata untuk pesan tersembunyi.",
    approach: "Uji metadata dan bit media sesuai jenis file yang tersedia.",
    tools: ["exiftool", "zsteg", "binwalk"],
    pattern: /\b(stego|steganografi|tersembunyi|hidden|gambar|image|audio|png|jpg|wav)\b/i,
    weight: 2,
  },
  {
    category: "digital-forensics",
    strategy: "Periksa artefak, header, string, dan jejak aktivitas.",
    approach: "Kumpulkan bukti dari artefak sebelum memilih teknik lanjutan.",
    tools: ["file", "strings", "xxd", "exiftool"],
    pattern: /\b(forensik|forensic|disk|memory|dump|pcap|log|artefak|artifact|metadata|exif)\b/i,
    weight: 2,
  },
  {
    category: "reverse-engineering",
    strategy: "Disassemble biner dan telusuri logika validasi flag.",
    approach: "Cari fungsi validasi dan ekstrak konstanta yang terlibat.",
    tools: ["file", "r2", "gdb", "objdump"],
    pattern: /\b(reverse|reversing|disassemble|decompile|gdb|radare|ghidra|objdump|biner|binary)\b/i,
    weight: 2,
  },
  {
    category: "binary-exploitation",
    strategy: "Periksa proteksi biner lalu pilih teknik exploit yang sesuai bukti.",
    approach: "Uji jalur kerentanan di lingkungan terisolasi.",
    tools: ["checksec", "gdb", "python3"],
    pattern: /\b(pwn|exploit|overflow|stack|heap|rop|shellcode|canary|format string)\b/i,
    weight: 2,
  },
  {
    category: "web-security",
    strategy: "Analisis respons HTTP, parameter, cookie, dan endpoint.",
    approach: "Bandingkan perilaku aplikasi terhadap input yang sah.",
    tools: ["curl", "python3"],
    pattern: /\b(web|http|url|website|cookie|session|sql|xss|lfi|jwt|endpoint|login)\b/i,
    weight: 2,
  },
  {
    category: "network-analysis",
    strategy: "Tangkap dan analisis trafik, protokol, serta payload.",
    approach: "Ikuti stream dan ekstrak payload yang relevan.",
    tools: ["tshark", "tcpdump"],
    pattern: /\b(jaringan|network|packet|paket|traffic|trafik|tcp|udp|dns|wireshark|netcat)\b/i,
    weight: 2,
  },
  {
    category: "osint",
    strategy: "Korelasikan informasi publik dengan petunjuk challenge.",
    approach: "Verifikasi fakta publik sebelum menyimpulkan.",
    tools: ["dig", "whois", "curl"],
    pattern: /\b(osint|intelijen|dork|username|email|domain|whois|github|instagram)\b/i,
    weight: 2,
  },
  {
    category: "programming",
    strategy: "Tulis solver kecil sesuai kontrak input/output.",
    approach: "Jalankan solver pada input nyata dan bandingkan keluaran.",
    tools: ["python3", "gcc", "node"],
    pattern: /\b(pemrograman|programming|kode|code|python|script|algoritma|matematika|math)\b/i,
    weight: 2,
  },
];

const CATEGORY_LABEL: Record<ChallengeCategory, string> = {
  cryptography: "Kriptografi",
  steganography: "Steganografi",
  "digital-forensics": "Forensik Digital",
  "reverse-engineering": "Reverse Engineering",
  "binary-exploitation": "Binary Exploitation",
  "web-security": "Web Security",
  "network-analysis": "Analisis Jaringan",
  osint: "OSINT",
  programming: "Pemrograman",
  miscellaneous: "Lainnya",
};

function collectEvidence(input: ChallengeUnderstandingInput): ChallengeEvidenceItem[] {
  const items: ChallengeEvidenceItem[] = [];
  if (input.title?.trim()) items.push({ kind: "title", value: input.title });
  if (input.description?.trim()) items.push({ kind: "description", value: input.description });
  for (const hint of input.hints || []) if (hint.trim()) items.push({ kind: "hint", value: hint });
  for (const instruction of input.instructions || []) if (instruction.trim()) items.push({ kind: "hint", value: instruction });
  for (const file of input.files || []) {
    if (file.name.trim()) items.push({ kind: "filename", value: file.name, label: "nama file" });
    if (file.mimeType?.trim()) items.push({ kind: "filetype", value: file.mimeType, label: "MIME" });
    if (file.detectedType?.trim()) items.push({ kind: "filetype", value: file.detectedType, label: "tipe terdeteksi" });
  }
  for (const output of input.terminalOutputs || []) if (output.trim()) items.push({ kind: "terminal-output", value: output });
  for (const code of input.sourceCode || []) if (code.trim()) items.push({ kind: "source", value: code });
  for (const meta of input.metadata || []) if (meta.trim()) items.push({ kind: "metadata", value: meta });
  return items;
}

function applicableRules(item: ChallengeEvidenceItem): Rule[] {
  if (item.kind === "filename" || item.kind === "filetype") return FILE_RULES;
  if (item.kind === "terminal-output") return [...CONTENT_RULES, ...FILE_RULES];
  if (item.kind === "source" || item.kind === "metadata") return CONTENT_RULES;
  return [...CONTENT_RULES, ...TEXT_RULES];
}

function detectFlagFormat(evidence: ChallengeEvidenceItem[]): string | undefined {
  for (const item of evidence) {
    const match = item.value.match(/\b([A-Za-z][A-Za-z0-9_]{1,24})\{[^}\r\n]*\}/);
    if (match && !/^(your|insert|contoh|example|sample|flag_here)/i.test(match[1])) {
      return `${match[1]}{...}`;
    }
    const described = item.value.match(/(?:format|prefix|flag)\s*[:=]?\s*([A-Za-z][A-Za-z0-9_]{1,24})\s*\{/i);
    if (described) return `${described[1]}{...}`;
  }
  return undefined;
}

function detectDifficulty(evidence: ChallengeEvidenceItem[]): string | undefined {
  for (const item of evidence) {
    const match = item.value.match(/\b(easy|medium|hard|insane| beginner|menengah|sulit|sangat\s+sulit)\b/i);
    if (match) return match[1].trim().toLowerCase();
  }
  return undefined;
}

/** Builds a complete understanding record from supplied evidence only. */
export function understandChallenge(input: ChallengeUnderstandingInput): ChallengeUnderstanding {
  const evidence = collectEvidence(input);
  const scores = new Map<ChallengeCategory, number>();
  const signals: ClassificationSignal[] = [];

  const picoCategory: PicoctfCategory | undefined = detectPicoctfCategory(
    evidence.map((item) => item.value).join("\n"),
  );
  if (picoCategory) {
    const mapping = picoctfCategoryMapping(picoCategory, "label kategori picoCTF eksplisit");
    const internalCategory = mapping.internalCategory as ChallengeCategory;
    signals.push({
      category: internalCategory,
      signal: mapping.label,
      evidence: "kategori platform",
      weight: 8,
    });
    scores.set(internalCategory, (scores.get(internalCategory) || 0) + 8);
  }

  for (const item of evidence) {
    for (const rule of applicableRules(item)) {
      const matches = item.value.match(rule.pattern);
      if (!matches?.length) continue;
      const evidenceLabel = item.label || item.kind.replace("-", " ");
      const signal: ClassificationSignal = {
        category: rule.category,
        signal: matches.slice(0, 3).join(", "),
        evidence: evidenceLabel,
        weight: rule.weight,
      };
      signals.push(signal);
      scores.set(rule.category, (scores.get(rule.category) || 0) + rule.weight);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const category = top ? top[0] : "miscellaneous";
  const total = signals.reduce((sum, item) => sum + item.weight, 0);
  const distinctEvidence = new Set(signals.map((item) => item.evidence)).size;
  const confidence = top
    ? Math.min(0.97, Number((0.5 + (top[1] / Math.max(total, 1)) * 0.3 + Math.min(distinctEvidence, 4) * 0.04).toFixed(2)))
    : 0.25;

  const preferred = signals.filter((item) => item.category === category);
  const categoryRule = [...CONTENT_RULES, ...FILE_RULES, ...TEXT_RULES].find(
    (rule) => rule.category === category,
  );
  const tools = [...new Set(preferred.flatMap((item) => {
    const rule = [...CONTENT_RULES, ...FILE_RULES, ...TEXT_RULES].find((entry) => entry.category === item.category);
    return rule?.tools || [];
  }))];
  const hints = [...(input.hints || []), ...(input.instructions || [])].filter(Boolean);
  const files = (input.files || []).map((file) => ({
    name: file.name,
    type: file.detectedType || file.mimeType,
  }));
  const flagFormat = detectFlagFormat(evidence);
  const difficulty = detectDifficulty(evidence);
  const missingInformation: string[] = [];
  if (!input.title?.trim()) missingInformation.push("Judul challenge tidak diberikan.");
  if (!input.description?.trim()) missingInformation.push("Deskripsi challenge tidak diberikan.");
  if (!files.length) missingInformation.push("Tidak ada artefak yang diberikan.");
  if (!flagFormat) missingInformation.push("Format flag tidak dinyatakan; gunakan pola yang teramati pada bukti.");
  if (!hints.length) missingInformation.push("Tidak ada hint eksplisit.");
  if (!difficulty) missingInformation.push("Tingkat kesulitan tidak dinyatakan.");
  if (!top) missingInformation.push("Bukti tidak cukup untuk klasifikasi selain 'Lainnya'.");

  return {
    title: input.title?.trim() || undefined,
    description: input.description?.trim() || undefined,
    category,
    ...(picoCategory ? { platformCategory: picoCategory } : {}),
    ...(picoCategory ? { platformCategoryLabel: picoctfCategoryLabel(picoCategory) } : {}),
    confidence,
    classificationEvidence: signals.slice(0, 20),
    difficulty,
    files,
    flagFormat,
    hints,
    requiredTools: tools,
    possibleApproaches: [
      preferred.length
        ? categoryRule?.approach || "Kumpulkan bukti awal dari file dan perintah nyata."
        : "Kumpulkan bukti awal dari file dan perintah nyata.",
      "Validasi setiap temuan terhadap format flag dan bukti eksekusi sebelum melaporkan jawaban.",
    ],
    validationRequirements: [
      flagFormat ? `Kandidat harus mengikuti format ${flagFormat}.` : "Format flag belum diketahui; verifikasi dari bukti server/oracle.",
      "Jawaban harus didukung output perintah nyata atau konfirmasi server.",
      "Jangan laporkan kandidat POTENTIAL sebagai flag terverifikasi.",
    ],
    missingInformation,
  };
}

export function understandingToClassification(understanding: ChallengeUnderstanding) {
  return {
    category: understanding.category,
    confidence: understanding.confidence,
    strategy: understanding.possibleApproaches[0],
    label: CATEGORY_LABEL[understanding.category],
    evidence: understanding.classificationEvidence,
    missingInformation: understanding.missingInformation,
  };
}

export function categoryDisplayName(category: ChallengeCategory): string {
  return CATEGORY_LABEL[category] || category;
}
