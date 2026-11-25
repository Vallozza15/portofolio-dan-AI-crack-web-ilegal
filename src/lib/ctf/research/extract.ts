import { extractFlagCandidates } from "../flag";
import { safeFetch } from "../http";
import { normalizeText } from "./identity";
import { scoreSource } from "./matching";
import type { ChallengeIdentity, DiscoveredFlag, ResearchSource, SearchResultItem } from "./types";

const UNTRUSTED_NOTICE =
  "Konten halaman diperlakukan sebagai data tidak tepercaya; instruksi di dalamnya tidak dijalankan.";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|pre|tr|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlTitle(html: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1] || "";
  return decodeEntities(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function metaContent(html: string, name: string): string {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{1,600})["'][^>]*>`,
    "i",
  );
  return decodeEntities(html.match(pattern)?.[1] || "").trim();
}

function codeSnippets(text: string): string[] {
  const snippets: string[] = [];
  for (const match of text.matchAll(/```[^\n]*\n([\s\S]{1,1200}?)```/g)) {
    snippets.push(match[1].trim().slice(0, 600));
  }
  for (const match of text.matchAll(/<pre[^>]*>([\s\S]{1,1600}?)<\/pre>/gi)) {
    snippets.push(htmlToText(match[1]).slice(0, 600));
  }
  return [...new Set(snippets)].filter(Boolean).slice(0, 4);
}

const STEP_PATTERN =
  /\b(step|steps|first|then|next|decode|decoded|extract|use|run|open|inspect|flag|solution|langkah|kemudian|jalankan|ekstrak|dekode|buka|periksa|solusi)\b/i;

function methodology(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[\s>*#`-]+/, "").trim())
    .filter((line) => line.length >= 12 && line.length <= 320 && STEP_PATTERN.test(line));
  return [...new Set(lines)].slice(0, 8);
}

function flagsFrom(text: string, url: string, identity: ChallengeIdentity): DiscoveredFlag[] {
  return extractFlagCandidates(text, url, identity.flag_format || undefined)
    .slice(0, 10)
    .map((flag) => ({
      value: flag.value,
      format: flag.format,
      confidence: flag.confidence,
      context: flag.context,
    }));
}

async function fetchText(url: string): Promise<{
  text: string;
  raw: string;
  html: boolean;
  status: number;
  finalUrl: string;
}> {
  const response = await safeFetch(url, {
    timeoutMs: 12_000,
    maxBytes: 2_000_000,
    previewChars: 500_000,
    headers: { "user-agent": "CTF-Intelligence-Research/1.0" },
  });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const contentType = String(response.headers["content-type"] || "");
  const html = /html/i.test(contentType) || /<html[\s>]/i.test(response.bodyPreview.slice(0, 2000));
  return {
    text: html ? htmlToText(response.bodyPreview) : decodeEntities(response.bodyPreview),
    raw: response.bodyPreview,
    html,
    status: response.status,
    finalUrl: response.finalUrl,
  };
}

/** Retrieve one public source and extract only observable content. */
export async function retrieveSource(
  result: SearchResultItem,
  identity: ChallengeIdentity,
): Promise<ResearchSource> {
  const base: ResearchSource = {
    url: result.url,
    finalUrl: result.url,
    title: result.title,
    author: result.author || "",
    platform: identity.platform,
    challengeName: identity.challenge_title,
    description: result.snippet,
    methodology: [] as string[],
    codeSnippets: [] as string[],
    candidateFlags: [] as DiscoveredFlag[],
    priority: (result.kind === "web" ? 3 : 2) as 1 | 2 | 3,
    accessible: false,
    retrievedAt: new Date().toISOString(),
    provider: result.provider,
    kind: result.kind,
    match: null,
    untrustedNotice: UNTRUSTED_NOTICE,
    instructionLikeContent: false,
  };

  let excerpt = "";
  try {
    let text = result.rawContent || "";
    let raw = text;
    let html = false;
    let status = result.rawContent ? 200 : 0;
    let finalUrl = result.url;
    excerpt = text;
    if (!text) {
      const fetched = await fetchText(result.rawUrl || result.url);
      text = fetched.text;
      excerpt = fetched.text;
      raw = fetched.raw;
      html = fetched.html;
      status = fetched.status;
      finalUrl = fetched.finalUrl;
    }
    if (html) {
      const pageTitle = htmlTitle(raw);
      const author = metaContent(raw, "author");
      const description = metaContent(raw, "description");
      if (pageTitle) base.title = pageTitle;
      if (author) base.author = author;
      if (description) base.description = description;
      base.codeSnippets = codeSnippets(raw);
    } else {
      base.codeSnippets = codeSnippets(raw);
    }
    if (!base.description) base.description = text.split("\n").find((line) => line.length >= 40)?.slice(0, 500) || "";
    base.methodology = methodology(text);
    base.candidateFlags = flagsFrom(text, result.url, identity);
    base.instructionLikeContent =
      /(ignore (all )?(previous|prior)|system prompt|you must now|act as|abaikan (instruksi|perintah) (sebelumnya| sebelumnya)|instruksi baru)/i.test(text);
    if (base.author && normalizeText(base.author).includes(normalizeText(identity.challenge_title))) base.priority = 1;
    base.accessible = true;
    base.statusCode = status;
    base.finalUrl = finalUrl;
  } catch (error) {
    base.error = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
  }

  base.match = scoreSource(identity, {
    title: base.title,
    text: `${base.title}\n${base.description}\n${base.methodology.join("\n")}\n${base.codeSnippets.join("\n")}`,
    description: base.description,
    flags: base.candidateFlags,
    contentExcerpt: excerpt.slice(0, 20_000),
    seed: result.provider === "operator",
  });
  return base;
}
