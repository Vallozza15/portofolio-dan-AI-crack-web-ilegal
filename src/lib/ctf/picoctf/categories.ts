/**
 * picoCTF/picoGym category vocabulary.
 *
 * These are labels published by picoCTF. They are mapped to the solver's
 * internal categories so existing analysis strategies keep working; no new
 * platform endpoint or undocumented API is introduced here.
 */

export const PICOCTF_CATEGORIES = [
  "cryptography",
  "forensics",
  "general-skills",
  "reverse-engineering",
  "web-exploitation",
  "binary-exploitation",
] as const;

export type PicoctfCategory = (typeof PICOCTF_CATEGORIES)[number];

export interface PicoctfCategoryMapping {
  label: string;
  internalCategory: string;
  confidence: number;
  evidence: string;
}

const LABELS: Record<PicoctfCategory, string> = {
  cryptography: "Cryptography",
  forensics: "Forensics",
  "general-skills": "General Skills",
  "reverse-engineering": "Reverse Engineering",
  "web-exploitation": "Web Exploitation",
  "binary-exploitation": "Binary Exploitation",
};

const INTERNAL: Record<PicoctfCategory, string> = {
  cryptography: "cryptography",
  forensics: "digital-forensics",
  "general-skills": "miscellaneous",
  "reverse-engineering": "reverse-engineering",
  "web-exploitation": "web-security",
  "binary-exploitation": "binary-exploitation",
};

const PATTERNS: Array<{ category: PicoctfCategory; pattern: RegExp }> = [
  { category: "cryptography", pattern: /\bcryptography\b|\bcrypto\b|enkripsi|dekripsi/i },
  { category: "forensics", pattern: /\bforensics?\b|forensik|disk image|pcap|packet capture/i },
  { category: "general-skills", pattern: /\bgeneral skills?\b|general skill|kemampuan umum/i },
  { category: "reverse-engineering", pattern: /\breverse engineering\b|\breversing\b|reverse\b/i },
  { category: "web-exploitation", pattern: /\bweb exploitation\b|\bweb exploit\b|eksploitasi web/i },
  { category: "binary-exploitation", pattern: /\bbinary exploitation\b|\bbinary exploit\b|eksploitasi biner|pwn\b/i },
];

/** Returns the first picoCTF category explicitly present in supplied evidence. */
export function detectPicoctfCategory(text: string): PicoctfCategory | undefined {
  if (!text) return undefined;
  for (const entry of PATTERNS) {
    if (entry.pattern.test(text)) return entry.category;
  }
  return undefined;
}

export function picoctfCategoryLabel(category: PicoctfCategory): string {
  return LABELS[category];
}

export function picoctfCategoryMapping(category: PicoctfCategory, evidence: string): PicoctfCategoryMapping {
  return {
    label: LABELS[category],
    internalCategory: INTERNAL[category],
    confidence: 0.92,
    evidence: evidence.slice(0, 300),
  };
}

export function isPicoctfCategory(value: string): value is PicoctfCategory {
  return (PICOCTF_CATEGORIES as readonly string[]).includes(value);
}
