import { safeFetch } from "../http";
import { selectQueries, toGitHubQuery } from "./queries";
import type { ResearchApiConfig, ResearchEvent, SearchResultItem } from "./types";

class ProviderRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function publicHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return "";
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return "";
    if (host.startsWith("[::1]") || host === "::1") return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await safeFetch(url, {
    headers,
    timeoutMs: 12_000,
    maxBytes: 3_000_000,
    previewChars: 400_000,
  });
  if (response.status === 403 || response.status === 429) {
    throw new ProviderRateLimitError(`HTTP ${response.status}`);
  }
  if (response.status !== 200) return {};
  try {
    return record(JSON.parse(response.bodyPreview));
  } catch {
    return {};
  }
}

async function githubSearch(
  kind: "repositories" | "issues" | "gists",
  query: string,
  token: string,
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  if (signal?.aborted) throw new Error("Pencarian dibatalkan.");
  const url = new URL(`https://api.github.com/search/${kind}`);
  url.searchParams.set("q", toGitHubQuery(query));
  url.searchParams.set("per_page", "5");
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "CTF-Intelligence-Research/1.0",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const data = await fetchJson(url.toString(), headers);
  const items = Array.isArray(data.items) ? data.items.slice(0, 5) : [];
  const results: SearchResultItem[] = [];

  for (const raw of items) {
    const item = record(raw);
    const htmlUrl = publicHttpUrl(text(item.html_url));
    if (!htmlUrl) continue;
    const owner = record(item.owner);
    const author = text(owner.login);
    if (kind === "repositories") {
      const fullName = text(item.full_name);
      const branch = text(item.default_branch) || "HEAD";
      results.push({
        url: htmlUrl,
        title: fullName || text(item.name) || htmlUrl,
        snippet: text(item.description),
        provider: "github",
        kind: "repository",
        author,
        repository: fullName,
        publishedAt: text(item.pushed_at),
        rawUrl: fullName
          ? `https://raw.githubusercontent.com/${encodeURI(fullName)}/${encodeURIComponent(branch)}/README.md`
          : undefined,
      });
    } else if (kind === "issues") {
      if (item.pull_request) continue;
      results.push({
        url: htmlUrl,
        title: text(item.title) || htmlUrl,
        snippet: text(item.body).slice(0, 800),
        provider: "github",
        kind: "issue",
        author,
        repository: text(record(item.repository_url).full_name) || undefined,
        publishedAt: text(item.created_at),
        rawContent: text(item.body).slice(0, 200_000),
      });
    } else {
      const files = record(item.files);
      const first = Object.values(files)[0];
      const file = record(first);
      results.push({
        url: htmlUrl,
        title: text(item.description) || text(item.id) || htmlUrl,
        snippet: text(item.description).slice(0, 300),
        provider: "github",
        kind: "gist",
        author,
        publishedAt: text(item.created_at),
        rawUrl: publicHttpUrl(text(file.raw_url)) || undefined,
        rawContent: text(file.content).slice(0, 200_000),
      });
    }
  }
  return results;
}

async function webSearch(
  provider: "brave" | "googleCse",
  query: string,
  config: ResearchApiConfig,
): Promise<SearchResultItem[]> {
  if (!config.apiKey) return [];
  if (provider === "googleCse" && !config.cx) return [];
  const url =
    provider === "brave"
      ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`
      : `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&num=8&key=${encodeURIComponent(config.apiKey || "")}&cx=${encodeURIComponent(config.cx || "")}`;
  const headers: Record<string, string> =
    provider === "brave"
      ? { accept: "application/json", "x-subscription-token": config.apiKey }
      : { accept: "application/json" };
  const data = await fetchJson(url, headers);
  const rawItems =
    provider === "brave"
      ? Array.isArray(record(data.web).results)
        ? (record(data.web).results as unknown[])
        : []
      : Array.isArray(data.items)
        ? (data.items as unknown[])
        : [];

  return rawItems.slice(0, 8).flatMap((raw) => {
    const item = record(raw);
    const link = provider === "brave" ? text(item.url) : text(item.link);
    const safe = publicHttpUrl(link);
    if (!safe) return [];
    return [
      {
        url: safe,
        title: text(item.title) || safe,
        snippet: text(provider === "brave" ? item.description : item.snippet).slice(0, 800),
        provider,
        kind: "web" as const,
        publishedAt: text(item.age) || text(item.publishedDate),
      },
    ];
  });
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return value;
  }
}

/** Convert operator-supplied writeup URLs into retrievable sources without search APIs. */
export function resultsFromSeedUrls(urls: string[]): SearchResultItem[] {
  return urls.slice(0, 8).flatMap((raw) => {
    const url = publicHttpUrl(String(raw || "").trim());
    if (!url) return [];
    let label = url;
    try {
      const parsed = new URL(url);
      const last = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean).slice(-1)[0] || "";
      label = last ? `${parsed.hostname}: ${last}` : parsed.hostname;
    } catch {
      // Keep full URL as label.
    }
    return [
      {
        url,
        title: label,
        snippet: "URL writeup diberikan operator; konten diambil langsung dari sumber asli.",
        provider: "operator" as const,
        kind: "web" as const,
      },
    ];
  });
}

export async function collectSearchResults(
  queries: string[],
  config: ResearchApiConfig,
  emit: (event: ResearchEvent) => void,
  signal?: AbortSignal,
  seedUrls: string[] = [],
): Promise<SearchResultItem[]> {
  const found: SearchResultItem[] = [];
  const seen = new Set<string>();
  const add = (items: SearchResultItem[]) => {
    for (const item of items) {
      const key = canonicalUrl(item.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      found.push(item);
    }
  };

  const seeds = resultsFromSeedUrls(seedUrls);
  add(seeds);
  emit({
    type: "provider",
    provider: "operator",
    status: seeds.length ? "ok" : "skipped",
    count: seeds.length,
    message: seeds.length
      ? `${seeds.length} URL writeup dari operator akan diambil dan dinilai langsung.`
      : "Tidak ada URL writeup yang diberikan operator.",
  });

  const githubQueries = selectQueries(queries, "github", config.githubToken ? 4 : 2);
  let githubCount = 0;
  let githubError = "";
  for (const query of githubQueries) {
    if (signal?.aborted) throw new Error("Pencarian dibatalkan.");
    emit({ type: "query", query, provider: "github" });
    try {
      const kinds: Array<"repositories" | "issues" | "gists"> = ["repositories", "issues", "gists"];
      const batches = await Promise.all(
        kinds.map((kind) => githubSearch(kind, query, config.githubToken || "", signal).catch((error: unknown) => error)),
      );
      for (const batch of batches) {
        if (batch instanceof ProviderRateLimitError) throw batch;
        if (batch instanceof Error) continue;
        add(batch as SearchResultItem[]);
      }
    } catch (error) {
      githubError = error instanceof Error ? error.message : String(error);
      break;
    }
  }
  githubCount = found.length;
  emit({
    type: "provider",
    provider: "github",
    status: githubError ? "error" : githubQueries.length ? "ok" : "skipped",
    count: githubCount,
    message: githubError
      ? `GitHub API berhenti lebih awal: ${githubError}. Hasil yang sudah terkumpul tetap dipakai.`
      : githubQueries.length
        ? `${githubQueries.length} query GitHub API dijalankan tanpa scraping.`
        : "Tidak ada query GitHub yang tersedia.",
  });

  if (config.enabled && config.apiKey && ["brave", "googleCse"].includes(config.provider)) {
    const webProvider = config.provider as "brave" | "googleCse";
    if (webProvider === "googleCse" && !config.cx) {
      emit({
        type: "provider",
        provider: webProvider,
        status: "skipped",
        count: 0,
        message: "Google CSE memerlukan cx dari pengaturan operator.",
      });
    } else {
      let count = 0;
      let error = "";
      for (const query of selectQueries(queries, "web", 5)) {
        if (signal?.aborted) throw new Error("Pencarian dibatalkan.");
        emit({ type: "query", query, provider: webProvider });
        try {
          const items = await webSearch(webProvider, query, config);
          add(items);
          count += items.length;
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
          break;
        }
      }
      emit({
        type: "provider",
        provider: webProvider,
        status: error ? "error" : "ok",
        count,
        message: error
          ? `Penyedia web API gagal: ${error}.`
          : `${count} hasil diterima dari API resmi ${webProvider}.`,
      });
    }
  } else {
    emit({
      type: "provider",
      provider: ["brave", "googleCse"].includes(config.provider) ? config.provider : "github",
      status: "skipped",
      count: 0,
      message:
        config.provider === "github"
          ? "Penyedia web API tidak dipilih; hanya GitHub public API yang dipakai."
          : "API key web belum diisi oleh operator; tidak ada pencarian web eksternal.",
    });
  }

  return found.slice(0, 24);
}
