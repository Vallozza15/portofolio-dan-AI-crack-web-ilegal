import type { ChallengeIdentity } from "./types";

const CATEGORY_TERMS: Record<string, string[]> = {
  cryptography: ["cipher", "decode", "encoding", "modular arithmetic"],
  "web-security": ["burp suite", "http request", "sql injection", "xss"],
  "web-exploitation": ["burp suite", "http request", "sql injection", "xss"],
  forensics: ["pcap", "strings", "metadata", "file carving"],
  "general-skills": ["encoding", "introductory", "observation"],
  "reverse-engineering": ["ghidra", "radare2", "objdump", "disassembly"],
  "binary-exploitation": ["pwn", "buffer overflow", "rop chain", "checksec"],
};

/** Ten fixed patterns plus bounded category-specific variations. */
export function buildSearchQueries(identity: ChallengeIdentity, limit = 12): string[] {
  const title = identity.challenge_title || identity.normalized_title;
  const platform = identity.platform || "CTF";
  const raw = [
    `"${title}" ${platform} writeup`,
    `"${title}" CTF solution`,
    `"${title}" flag`,
    `"${title}" walkthrough`,
    `"${title}" github`,
    `site:github.com ${title} CTF`,
    `site:medium.com ${title} writeup`,
    `${platform} ${title} explained`,
    `"${title}" solved CTF`,
    `"${title}" walkthrough flag`,
  ];
  if (identity.event && identity.event.toLowerCase() !== platform.toLowerCase()) {
    raw.unshift(`"${title}" ${identity.event} writeup`);
  }
  if (identity.year) raw.unshift(`"${title}" ${identity.year} writeup`);
  const category = identity.category.trim().toLowerCase();
  const terms = CATEGORY_TERMS[category] || [];
  for (const term of terms) raw.push(`"${title}" ${term} writeup`);

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const item of raw) {
    const query = item.replace(/\s+/g, " ").trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key) || query.length > 240) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= Math.max(1, Math.min(limit, 16))) break;
  }
  return queries;
}

/** GitHub search syntax does not accept search-engine operators. */
export function toGitHubQuery(query: string): string {
  return query
    .replace(/site:[^\s]+/gi, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function selectQueries(queries: string[], provider: "github" | "web", cap: number): string[] {
  return queries.slice(0, cap);
}
