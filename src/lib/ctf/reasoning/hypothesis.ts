import type { HypothesisDraft } from "./types";

interface HypothesisTemplate {
  technique: string;
  keywords: string[];
  description: string;
  confidence: number;
}

const CATEGORY_TEMPLATES: Record<string, HypothesisTemplate[]> = {
  cryptography: [
    {
      technique: "xor",
      keywords: ["xor"],
      description: "Flag kemungkinan disembunyikan dengan XOR satu byte atau kunci berulang pada data.",
      confidence: 0.5,
    },
    {
      technique: "base64",
      keywords: ["base64", "encoding", "dekode"],
      description: "Flag kemungkinan berada di balik lapisan encoding Base64 atau dekode bertingkat.",
      confidence: 0.46,
    },
    {
      technique: "substitusi",
      keywords: ["caesar", "rot13", "substitusi"],
      description: "Teks kemungkinan menggunakan substitusi Caesar atau ROT13 sebelum menjadi flag.",
      confidence: 0.42,
    },
  ],
  steganography: [
    {
      technique: "lsb",
      keywords: ["lsb", "bit"],
      description: "Flag kemungkinan tersimpan pada bit warna paling rendah dari citra.",
      confidence: 0.5,
    },
    {
      technique: "metadata",
      keywords: ["exif", "metadata", "komentar"],
      description: "Flag kemungkinan ditaruh pada metadata atau komentar file gambar.",
      confidence: 0.46,
    },
    {
      technique: "data lampiran",
      keywords: ["append", "lampiran", "trailing"],
      description: "Flag kemungkinan berada pada byte tambahan di akhir file setelah penanda akhir.",
      confidence: 0.42,
    },
  ],
  forensics: [
    {
      technique: "pcap",
      keywords: ["pcap", "dns", "packet"],
      description: "Flag kemungkinan muncul pada lalu lintas paket, kueri DNS, atau sesi HTTP.",
      confidence: 0.5,
    },
    {
      technique: "metadata",
      keywords: ["exif", "metadata", "timestamp"],
      description: "Flag kemungkinan tersisa pada metadata atau linimasa file yang dianalisis.",
      confidence: 0.46,
    },
    {
      technique: "file tersembunyi",
      keywords: ["carve", "arsip", "archive", "embedded"],
      description: "Flag kemungkinan berada pada file tersembunyi atau arsip yang bisa diekstraksi.",
      confidence: 0.42,
    },
  ],
  web: [
    {
      technique: "kode sumber",
      keywords: ["source", "javascript", "html"],
      description: "Flag kemungkinan tertinggal pada kode sumber halaman atau skrip sisi klien.",
      confidence: 0.5,
    },
    {
      technique: "cookie",
      keywords: ["cookie", "session", "header"],
      description: "Flag kemungkinan disimpan pada cookie, header respons, atau parameter sesi.",
      confidence: 0.46,
    },
    {
      technique: "direktori",
      keywords: ["directory", "endpoint", "parameter"],
      description: "Flag kemungkinan dapat diakses lewat direktori atau endpoint yang belum terdaftar.",
      confidence: 0.42,
    },
  ],
  reverse: [
    {
      technique: "string",
      keywords: ["strings", "string"],
      description: "Flag kemungkinan terlihat pada string mentah biner sebelum proses lain diterapkan.",
      confidence: 0.5,
    },
    {
      technique: "dekompilasi",
      keywords: ["decompile", "disassembly", "fungsi"],
      description: "Flag kemungkinan dibangun oleh fungsi yang hanya terlihat setelah dekompilasi.",
      confidence: 0.46,
    },
    {
      technique: "anti-debug",
      keywords: ["anti-debug", "debug", "packer"],
      description: "Flag kemungkinan baru muncul setelah melewati pemeriksaan anti-debug atau unpacking.",
      confidence: 0.42,
    },
  ],
  binary: [
    {
      technique: "string",
      keywords: ["strings", "string"],
      description: "Flag kemungkinan terdapat pada string biner yang belum terhapus.",
      confidence: 0.5,
    },
    {
      technique: "entropi",
      keywords: ["entropy", "section", "seksi"],
      description: "Flag kemungkinan tersimpan pada seksi dengan entropi tinggi yang perlu diurai.",
      confidence: 0.46,
    },
    {
      technique: "packer",
      keywords: ["packer", "upx", "packed"],
      description: "Flag kemungkinan terenkripsi oleh packer dan muncul setelah proses unpacking.",
      confidence: 0.42,
    },
  ],
  osint: [
    {
      technique: "akun publik",
      keywords: ["username", "akun", "profil"],
      description: "Flag kemungkinan bisa dikaitkan dari nama pengguna atau profil publik yang diberikan.",
      confidence: 0.5,
    },
    {
      technique: "metadata publik",
      keywords: ["exif", "metadata", "lokasi"],
      description: "Flag kemungkinan tersimpan pada metadata dokumen yang dibagikan secara publik.",
      confidence: 0.46,
    },
    {
      technique: "sumber terbuka",
      keywords: ["web", "sumber", "public"],
      description: "Flag kemungkinan terdapat pada halaman atau arsip sumber terbuka terkait challenge.",
      confidence: 0.42,
    },
  ],
  misc: [
    {
      technique: "qr",
      keywords: ["qr", "barcode"],
      description: "Flag kemungkinan hasil decode kode QR atau barcode pada lampiran.",
      confidence: 0.5,
    },
    {
      technique: "encoding",
      keywords: ["base64", "encoding", "hex"],
      description: "Flag kemungkinan memerlukan satu lapisan encoding tambahan sebelum terbaca.",
      confidence: 0.46,
    },
    {
      technique: "tanda tangan file",
      keywords: ["magic", "signature", "file"],
      description: "Flag kemungkinan tersembunyi karena format file sebenarnya berbeda dari nama ekstensinya.",
      confidence: 0.42,
    },
  ],
};

const GENERIC_TEMPLATES: HypothesisTemplate[] = [
  {
    technique: "string",
    keywords: ["string", "strings"],
    description: "Flag mungkin muncul langsung pada string mentah hasil ekstraksi.",
    confidence: 0.45,
  },
  {
    technique: "flag",
    keywords: ["flag"],
    description: "Flag mungkin tersimpan dalam format standar pada salah satu sumber yang tersedia.",
    confidence: 0.4,
  },
  {
    technique: "identifikasi",
    keywords: ["format", "identifikasi", "tipe"],
    description: "Analisis perlu dimulai dari identifikasi format agar arah teknik tidak keliru.",
    confidence: 0.38,
  },
];

const STOPWORDS = new Set([
  "atau", "dan", "dapat", "dari", "dalam", "dengan", "dianggap", "ini", "itu", "juga",
  "kemungkinan", "lebih", "pada", "sebuah", "sebelum", "sedang", "tentang", "tidak", "yang",
  "the", "and", "into", "that", "this", "with", "from", "for", "not", "was", "were",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clip(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function tokenize(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of normalize(value).matchAll(/[a-z0-9]{3,}/g)) {
    const token = match[0];
    if (!STOPWORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

export function buildHypotheses(input: {
  category?: string;
  files?: Array<{ name: string; magic?: string }>;
  question: string;
  previousFailures?: string[];
  language?: "id" | "en";
}): HypothesisDraft[] {
  const category = normalize(input.category ?? "");
  const templates = [...(CATEGORY_TEMPLATES[category] ?? []), ...GENERIC_TEMPLATES].slice(0, 4);
  const firstFile = input.files?.[0];
  if (firstFile) {
    const name = firstFile.name.trim() || "lampiran";
    templates.push({
      technique: "lampiran",
      keywords: ["file", "lampiran", "magic"],
      description: `Lampiran ${clip(name, 80)} mungkin menyimpan flag pada konten atau metadatanya.`,
      confidence: 0.38,
    });
  }

  const failures = input.previousFailures ?? [];
  return templates.slice(0, 5).map((template, index) => {
    const contradictingEvidence = failures
      .filter((failure) => {
        const text = normalize(failure);
        return template.keywords.some((keyword) => text.includes(keyword));
      })
      .slice(0, 2)
      .map((failure) => `Percobaan sebelumnya gagal pada teknik ${template.technique}: ${clip(failure, 140)}`);

    return {
      id: `H${index + 1}`,
      description: template.description,
      supportingEvidence: [],
      contradictingEvidence,
      requiredTests: [],
      confidence: template.confidence,
      status: "open" as const,
    };
  });
}

export function scoreHypotheses(input: {
  hypotheses: HypothesisDraft[];
  evidenceTexts: string[];
  failures?: string[];
  flagFormat?: string;
  expectedFlag?: string;
}): HypothesisDraft[] {
  const expected = input.expectedFlag?.trim() ?? "";
  const formatToken = input.flagFormat?.trim().replace(/\{.*$/, "").toLowerCase() ?? "";

  return input.hypotheses.map((hypothesis) => {
    const sourceText = [hypothesis.description, ...hypothesis.requiredTests].join(" ");
    const hypothesisTokens = tokenize(sourceText);

    const supportMatches = input.evidenceTexts
      .map((text) => ({ text, score: overlap(hypothesisTokens, tokenize(text)) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const failureMatches = (input.failures ?? [])
      .map((text) => ({ text, score: overlap(hypothesisTokens, tokenize(text)) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const supportingEvidence = [...hypothesis.supportingEvidence];
    for (const item of supportMatches) {
      if (supportingEvidence.length >= 3) break;
      const line = clip(item.text, 200);
      if (line && !supportingEvidence.includes(line)) supportingEvidence.push(line);
    }

    const contradictingEvidence = [...hypothesis.contradictingEvidence];
    for (const item of failureMatches) {
      if (contradictingEvidence.length >= 2) break;
      const line = `Kegagalan terkait: ${clip(item.text, 160)}`;
      if (!contradictingEvidence.includes(line)) contradictingEvidence.push(line);
    }

    const supportCount = supportingEvidence.length;
    const contradictionCount = contradictingEvidence.length;
    const expectedPresent = Boolean(
      expected && input.evidenceTexts.some((text) => text.includes(expected)),
    );
    const mentionsFlag = /flag/i.test(sourceText);

    let confidence = 0.35 + supportMatches.length * 0.15 - failureMatches.length * 0.12;
    if (formatToken && normalize(sourceText).includes(formatToken)) confidence += 0.05;
    if (expectedPresent && mentionsFlag) confidence = 1;
    confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));

    let status: HypothesisDraft["status"] = "open";
    if (contradictionCount > supportCount) status = "rejected";
    else if (expectedPresent && mentionsFlag) status = "confirmed";
    else if (confidence >= 0.65) status = "supported";
    else if (hypothesis.requiredTests.length > 0) status = "testing";

    return {
      ...hypothesis,
      supportingEvidence,
      contradictingEvidence,
      confidence,
      status,
    };
  });
}
