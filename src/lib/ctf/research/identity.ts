import type { ChallengeIdentity } from "./types";

export interface IdentityInput {
  title: string;
  platform?: string;
  category?: string;
  url?: string;
  description?: string;
  flagFormat?: string;
  artifacts?: string[];
}

const PLATFORM_ALIASES: Array<[RegExp, string]> = [
  [/\bpico[\s_-]?(?:ctf|gym|gim)\b/i, "picoCTF"],
  [/\bhack[\s_-]?the[\s_-]?box\b|\bhtb\b/i, "HackTheBox"],
  [/\btry[\s_-]?hack[\s_-]?me\b|\bthm\b/i, "TryHackMe"],
  [/\bover[\s_-]?the[\s_-]?wire\b/i, "OverTheWire"],
  [/\broot[\s_-]?me\b/i, "Root-Me"],
  [/\bhacker101\b/i, "Hacker101"],
  [/\bctfd\b/i, "CTFd"],
  [/\bcompfest\b/i, "COMPFEST"],
  [/\bgemastik\b/i, "Gemastik"],
  [/\bcyber[\s_-]?jawara\b/i, "CyberJawara"],
  [/\btcp1p\b/i, "TCP1P"],
];

const PLATFORM_FLAG_PREFIX: Record<string, string> = {
  picoCTF: "picoCTF",
  HackTheBox: "HTB",
  TryHackMe: "THM",
  OverTheWire: "otw",
  "Root-Me": "RM",
  COMPFEST: "COMPFEST",
  Gemastik: "Gemastik",
  CyberJawara: "CyberJawara",
  TCP1P: "TCP1P",
};

const GENERIC_TITLES = new Set([
  "web", "crypto", "cryptography", "forensics", "misc", "miscellaneous", "pwn", "re",
  "reverse", "reversing", "binary", "baby crypto", "baby web", "baby pwn", "intro",
  "introduction", "challenge", "challenge 1", "level 1", "sanity check",
]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "was", "are", "you", "your",
  "into", "about", "dari", "yang", "untuk", "dengan", "pada", "adalah", "ini", "itu",
  "writeup", "write", "up", "solution", "solusi", "walkthrough", "flag", "challenge",
  "ctf", "picoctf", "level", "part", "version",
]);

export function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(value: string, removeStopWords = false): string[] {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  return removeStopWords ? tokens.filter((token) => !STOP_WORDS.has(token) && token.length > 2) : tokens;
}

function cleanTitle(title: string): string {
  return String(title || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\b(?:20\d{2})\b/g, " ")
    .replace(/\b(?:write[\s-]?up|walkthrough|solution|solusi|flag|complete|picoctf)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function detectPlatform(text: string): string {
  for (const [pattern, label] of PLATFORM_ALIASES) {
    if (pattern.test(text)) return label;
  }
  return "";
}

function detectFlagFormat(text: string, platform: string, explicit?: string): { format: string; prefix: string } {
  if (explicit?.trim()) {
    const raw = explicit.trim().slice(0, 120);
    const match = raw.match(/^([A-Za-z][A-Za-z0-9_]{0,24})\{[^}]*\}$/);
    if (match) return { format: `${match[1]}{...}`, prefix: match[1] };
    const prefix = raw.replace(/\{.*$/, "");
    return { format: raw.includes("{") ? raw : `${raw}{...}`, prefix };
  }
  const match = text.match(/\b([A-Za-z][A-Za-z0-9_]{1,24})\{[^}\r\n]{1,200}\}/);
  if (match) return { format: `${match[1]}{...}`, prefix: match[1] };
  const inferred = PLATFORM_FLAG_PREFIX[platform] || "";
  return { format: inferred ? `${inferred}{...}` : "", prefix: inferred };
}

/** Build an evidence-only identity profile. Missing fields stay empty. */
export function buildIdentity(input: IdentityInput): ChallengeIdentity {
  const title = String(input.title || "").trim().slice(0, 200);
  const platformSource = `${input.platform || ""} ${input.url || ""}`;
  const platform = detectPlatform(platformSource) || String(input.platform || "").trim().slice(0, 80);
  const combined = `${title} ${input.platform || ""} ${input.category || ""} ${input.description || ""}`;
  const eventMatch = combined.match(/\b(compfest|gemastik|cyber\s?jawara|tcp1p|picoctf|pico[\s_-]?gym)\b/i);
  const yearMatch = combined.match(/\b(20(?:1[5-9]|2\d|30))\b/);
  const clean = cleanTitle(title);
  const normalized = normalizeText(clean);
  const { format, prefix } = detectFlagFormat(
    `${input.description || ""} ${input.flagFormat || ""}`,
    platform,
    input.flagFormat,
  );
  const categories = String(input.category || "").trim().slice(0, 80);
  const variants = new Set<string>();
  if (title) variants.add(title);
  if (clean) variants.add(clean);
  if (normalized) {
    variants.add(normalized);
    variants.add(normalized.replace(/ /g, "-"));
    variants.add(normalized.replace(/ /g, "_"));
    variants.add(tokenize(normalized, true).join(" "));
  }
  if (eventMatch && clean) {
    const withoutEvent = clean.replace(new RegExp(eventMatch[1], "i"), "").replace(/\s+/g, " ").trim();
    if (withoutEvent) variants.add(normalizeText(withoutEvent));
  }
  const descriptionTokens = [...new Set(tokenize(input.description || "", true))].slice(0, 30);
  const artifactTokens = [...new Set((input.artifacts || []).flatMap((item) => tokenize(item, true)))].slice(0, 30);
  const generic = normalized.split(" ").length <= 2 && GENERIC_TITLES.has(normalized);
  const knownPlatform = PLATFORM_ALIASES.some(([pattern]) => pattern.test(platformSource));

  let score = 0.45;
  if (title.length >= 8) score += 0.12;
  if (knownPlatform) score += 0.18;
  else if (platform) score += 0.05;
  if (categories) score += 0.08;
  if (safeUrl(input.url || "")) score += 0.07;
  if ((input.description || "").trim().length >= 40) score += 0.07;
  if (eventMatch || yearMatch) score += 0.03;
  if (generic) score -= 0.2;
  score = Math.max(0.1, Math.min(0.98, Number(score.toFixed(2))));

  const notes: string[] = [];
  if (!platform) notes.push("Platform tidak dikenali dari input; pencarian tetap dilakukan dengan kata kunci mentah.");
  if (!categories) notes.push("Kategori tidak diberikan; query tambahan berbasis kategori tidak dipakai.");
  if (!input.description) notes.push("Deskripsi tidak diberikan; pencocokan hanya memakai judul, platform, dan artefak yang tersedia.");
  if (!format) notes.push("Format flag tidak diketahui; kandidat tidak dinilai dari prefix saja.");
  if (generic) notes.push("Judul bersifat umum; beberapa challenge bisa memiliki nama sama.");

  return {
    challenge_title: title,
    normalized_title: normalized,
    platform,
    event: eventMatch ? eventMatch[1].replace(/\s+/g, " ").trim() : "",
    year: yearMatch ? yearMatch[1] : "",
    category: categories,
    challenge_url: safeUrl(input.url || ""),
    flag_format: format,
    identity_confidence: score >= 0.8 ? "high" : score >= 0.6 ? "medium" : "low",
    title_variants: [...variants].filter(Boolean).slice(0, 10),
    ambiguous: generic || !knownPlatform,
    description_tokens: descriptionTokens,
    artifact_tokens: artifactTokens,
    flag_prefix: prefix,
    notes,
  };
}
