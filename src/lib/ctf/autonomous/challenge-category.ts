export type ChallengeCategory =
  | "cryptography"
  | "steganography"
  | "digital-forensics"
  | "reverse-engineering"
  | "binary-exploitation"
  | "web-security"
  | "network-analysis"
  | "osint"
  | "programming"
  | "miscellaneous";

export interface ChallengeClassification {
  category: ChallengeCategory;
  confidence: number;
  strategy: string;
}

const RULES: Array<{
  category: ChallengeCategory;
  strategy: string;
  pattern: RegExp;
}> = [
  {
    category: "digital-forensics",
    strategy: "Gunakan tool forensik Kali untuk memeriksa artefak dan metadata.",
    pattern: /\b(?:picoctf\s+)?forensics?\b|\bforensik\b/i,
  },
  {
    category: "miscellaneous",
    strategy: "Kerjakan tugas umum dengan parser/skrip kecil, lalu verifikasi dari bukti nyata.",
    pattern: /\bgeneral skills?\b|\bkemampuan umum\b/i,
  },
  {
    category: "reverse-engineering",
    strategy: "Disassemble/dekompilasi artefak dan telusuri logika program sebelum menjalankannya.",
    pattern: /\breverse engineering\b|\breversing\b/i,
  },
  {
    category: "web-security",
    strategy: "Periksa request/response dan logika aplikasi web pada instance yang diizinkan.",
    pattern: /\bweb exploitation\b|\bweb exploit\b|\beksploitasi web\b/i,
  },
  {
    category: "binary-exploitation",
    strategy: "Analisis biner, cari kerentanan memori, dan uji hanya pada instance challenge yang diizinkan.",
    pattern: /\bbinary exploitation\b|\bbinary exploit\b|\beksploitasi biner\b|\bpwn\b/i,
  },
  {
    category: "cryptography",
    strategy: "Identifikasi encoding/cipher dari teks, lalu uji dekode yang sesuai dan verifikasi hasilnya.",
    pattern: /\b(crypto|crypt|chiper|cipher|xor|rot13|rot47|caesar|base64|base32|hex|vigenere|encrypt|decrypt|dekode|decode|enkripsi)\b/i,
  },
  {
    category: "steganography",
    strategy: "Periksa metadata, bit citra/audio, dan container tersembunyi dengan tool stego Kali.",
    pattern: /\b(stego|steganografi|stegano|zsteg|steghide|binwalk|lsb|gambar|image|audio|png|jpg|jpeg|wav|mp3)\b/i,
  },
  {
    category: "network-analysis",
    strategy: "Tangkap dan analisis trafik, protokol, serta payload untuk menemukan petunjuk.",
    pattern: /\b(network|jaringan|packet|paket|traffic|trafik|tcp|udp|dns|http|tshark|wireshark|socket|nc\b|netcat)\b/i,
  },
  {
    category: "digital-forensics",
    strategy: "Periksa artefak, header file, string, dan jejak aktivitas sebelum menyimpulkan flag.",
    pattern: /\b(forensik|forensic|disk|image\s*disk|memory|dump|volatilitas|pcap|log|artifact|artefak|exif|metadata)\b/i,
  },
  {
    category: "binary-exploitation",
    strategy: "Periksa proteksi biner, cari kerentanan, dan uji exploit hanya di lingkungan challenge.",
    pattern: /\b(pwn|exploit|overflow|stack|heap|ret2|rop|shellcode|canary|nx|aslr|format\s*string)\b/i,
  },
  {
    category: "reverse-engineering",
    strategy: "Identifikasi biner, lalu disassemble/dekompilasi dan telusuri logika validasi flag.",
    pattern: /\b(reverse|reversing|disassembly|disassemble|decompile|gdb|r2|radare|ghidra|objdump|elf|pe\b|binary|biner)\b/i,
  },
  {
    category: "web-security",
    strategy: "Analisis respons HTTP, parameter, cookie, dan endpoint sebelum menguji teknik web.",
    pattern: /\b(web|http|https|url|website|cookie|session|sql|xss|lfi|rfi|sqli|endpoint|form|login|jwt)\b/i,
  },
  {
    category: "osint",
    strategy: "Kumpulkan informasi publik yang relevan dan korelasikan dengan petunjuk challenge.",
    pattern: /\b(osint|intelijen|public|dork|google|username|email|domain|whois|social|instagram|twitter|github)\b/i,
  },
  {
    category: "programming",
    strategy: "Pahami format input/output challenge, tulis solver kecil, lalu jalankan di Kali.",
    pattern: /\b(programming|pemrograman|code|kode|python|script|algoritma|input|output|loop|matematika|math)\b/i,
  },
];

const LABELS: Record<ChallengeCategory, string> = {
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

export function classifyChallenge(text: string): ChallengeClassification {
  const sample = text.slice(0, 20_000);
  for (const rule of RULES) {
    const matches = sample.match(rule.pattern);
    if (matches?.length) {
      return {
        category: rule.category,
        confidence: Math.min(0.95, 0.55 + Math.min(matches.length, 5) * 0.08),
        strategy: rule.strategy,
      };
    }
  }
  return {
    category: "miscellaneous",
    confidence: 0.4,
    strategy: "Kumpulkan bukti awal dari file/perintah, lalu pilih metode berdasarkan output nyata.",
  };
}

export function categoryLabel(category: ChallengeCategory): string {
  return LABELS[category] || category;
}
