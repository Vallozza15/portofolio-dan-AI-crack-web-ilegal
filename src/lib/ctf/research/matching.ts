import { normalizeText, tokenize } from "./identity";
import type { ChallengeIdentity, DiscoveredFlag, SourceMatch } from "./types";

export interface MatchInput {
  title: string;
  text: string;
  description: string;
  flags: DiscoveredFlag[];
  /** Bounded cleaned page body, used only as evidence text. */
  contentExcerpt?: string;
  /** True when operator supplied the URL as a known write-up for this challenge. */
  seed?: boolean;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  "web-exploitation": ["web", "exploitation"],
  "web-security": ["web", "security"],
  "reverse-engineering": ["reverse", "reversing", "engineering"],
  "binary-exploitation": ["binary", "exploitation", "pwn"],
  "general-skills": ["general", "skills", "intro"],
  cryptography: ["cryptography", "crypto", "cipher"],
  forensics: ["forensics", "forensic"],
};

function overlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const set = new Set(right);
  const count = left.filter((token) => set.has(token)).length;
  return count / Math.min(left.length, right.length);
}

export function scoreSource(identity: ChallengeIdentity, input: MatchInput): SourceMatch {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  const sourceNorm = normalizeText(
    `${input.title} ${input.text} ${input.description} ${input.contentExcerpt || ""}`,
  );
  const titleNorm = normalizeText(input.title);
  const idNorm = identity.normalized_title;
  const idTokens = tokenize(idNorm);
  const sourceTokens = new Set(tokenize(sourceNorm));
  const arrayTokens = [...sourceTokens];

  let titleScore = 0;
  if (idNorm && idNorm === titleNorm) titleScore = 25;
  else if (idNorm && titleNorm && (idNorm.includes(titleNorm) || titleNorm.includes(idNorm)) && Math.min(idNorm.length, titleNorm.length) >= 8) {
    titleScore = 22;
  } else {
    titleScore = Math.round(20 * overlap(idTokens, arrayTokens));
  }
  breakdown.title = Math.max(0, Math.min(25, titleScore));
  if (breakdown.title >= 22) reasons.push("Judul sumber hampir sama dengan judul challenge.");

  const platformKey = normalizeText(identity.platform);
  breakdown.platform = platformKey && sourceNorm.includes(platformKey) ? 12 : 0;
  if (breakdown.platform) reasons.push("Platform yang diminta disebut di sumber.");

  const eventKey = normalizeText(identity.event);
  breakdown.event = eventKey && sourceNorm.includes(eventKey) ? 6 : 0;
  if (breakdown.event) reasons.push("Nama event sesuai.");

  breakdown.year = identity.year && sourceNorm.includes(identity.year) ? 4 : 0;
  if (breakdown.year) reasons.push("Tahun challenge sesuai.");

  const categoryTokens = CATEGORY_ALIASES[identity.category.trim().toLowerCase()] || tokenize(identity.category, true);
  const categoryHits = categoryTokens.filter((token) => arrayTokens.includes(token)).length;
  breakdown.category = categoryTokens.length ? Math.min(8, categoryHits * 4) : 0;
  if (breakdown.category) reasons.push("Kategori challenge disebut di sumber.");

  const descHits = identity.description_tokens.filter((token) => sourceTokens.has(token)).length;
  breakdown.description = identity.description_tokens.length
    ? Math.min(15, Math.round((descHits / Math.min(5, identity.description_tokens.length)) * 15))
    : 0;
  if (breakdown.description >= 8) reasons.push("Detail deskripsi challenge cocok.");

  const artifactHits = identity.artifact_tokens.filter((token) => sourceTokens.has(token)).length;
  breakdown.artifact = identity.artifact_tokens.length
    ? Math.min(10, Math.round((artifactHits / Math.min(3, identity.artifact_tokens.length)) * 10))
    : 0;
  if (breakdown.artifact) reasons.push("Artefak/nama file challenge disebut.");

  breakdown.flagPrefix = identity.flag_prefix && input.flags.some((flag) => flag.format.toLowerCase() === identity.flag_prefix.toLowerCase())
    ? 8
    : 0;
  if (breakdown.flagPrefix) reasons.push("Prefix flag sesuai dengan format yang diketahui.");

  breakdown.methodology = /\b(decode|decoded|base64|hex|rot13|strings|binwalk|exiftool|ghidra|radare|objdump|pwn|burp|curl|python|step|langkah|dekode)\b/i.test(input.text)
    ? 5
    : 0;
  breakdown.operatorSeed = input.seed ? 10 : 0;
  if (input.seed) reasons.push("URL write-up diberikan operator untuk challenge ini; konten aslinya tetap diperiksa.");

  let score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const independentEvidence = breakdown.platform + breakdown.description + breakdown.artifact + breakdown.event;
  if (independentEvidence === 0) {
    score = Math.min(score, 69);
    reasons.push("Hanya kesamaan judul; tidak cukup untuk menyatakan write-up ini milik challenge yang diminta.");
  }
  score = Math.max(0, Math.min(100, score));
  const tier: SourceMatch["tier"] = score >= 95 ? "exact" : score >= 85 ? "strong" : score >= 70 ? "potential" : "insufficient";

  return { score, tier, reasons, breakdown };
}
