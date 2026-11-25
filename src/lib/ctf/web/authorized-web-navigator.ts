import { assertAuthorizedUrl, authorizedFetch } from "../platforms/authorized-fetch";
import type { PlatformRequestContext } from "../platforms/types";

export type ChallengePageType =
  | "public-challenge"
  | "authenticated-challenge"
  | "local-environment"
  | "remote-instance"
  | "unrelated";

export interface WebPageSnapshot {
  url: string;
  title: string;
  text: string;
  links: string[];
  artifacts: string[];
  hints: string[];
  pageType: ChallengePageType;
  requiresAuth: boolean;
  untrustedInstructions: string[];
  untrusted: true;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  links: string[];
  status: number;
}

export interface BrowserProvider {
  readonly name: string;
  open(url: string, officialUrl: string, context: PlatformRequestContext): Promise<BrowserSnapshot>;
  close?(): Promise<void>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtml(html: string): { title: string; text: string; links: string[] } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href) => !href.startsWith("#") && !href.startsWith("javascript:"));
  return { title: stripHtml(title), text: stripHtml(html).slice(0, 200_000), links };
}

export class FetchBrowserProvider implements BrowserProvider {
  readonly name = "fetch";

  async open(url: string, officialUrl: string, context: PlatformRequestContext): Promise<BrowserSnapshot> {
    const response = await authorizedFetch(url, officialUrl, context);
    const html = response.text;
    const parsed = parseHtml(html);
    return { url: response.url, title: parsed.title, text: parsed.text, links: parsed.links, status: response.status };
  }
}

/**
 * Optional Playwright provider. Playwright is not a project dependency, so it
 * is loaded only when an operator has installed it locally. The fetch provider
 * remains the supported fallback for public static challenge pages.
 */
export class PlaywrightBrowserProvider implements BrowserProvider {
  readonly name = "playwright";

  constructor(private readonly browser: {
    newPage(): Promise<{
      goto(url: string, options?: object): Promise<unknown>;
      content(): Promise<string>;
      url(): string;
      close(): Promise<void>;
      setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
    }>;
    close(): Promise<void>;
  }) {}

  async open(url: string, officialUrl: string, context: PlatformRequestContext): Promise<BrowserSnapshot> {
    assertAuthorizedUrl(url, officialUrl, context);
    const page = await this.browser.newPage();
    try {
      if (context.sessionCookie) await page.setExtraHTTPHeaders?.({ cookie: context.sessionCookie });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: context.timeoutMs || 15_000 });
      const html = await page.content();
      const parsed = parseHtml(html);
      return { url: page.url(), title: parsed.title, text: parsed.text, links: parsed.links, status: 200 };
    } finally {
      await page.close();
    }
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}

export async function createBrowserProvider(): Promise<{ provider: BrowserProvider; note?: string }> {
  try {
    const playwrightModule = (await import("playwright")) as {
      chromium?: { launch(options?: object): Promise<unknown> };
    };
    if (!playwrightModule.chromium) throw new Error("playwright.chromium tidak tersedia");
    const failures: string[] = [];
    for (const channel of ["msedge", "chrome", undefined]) {
      try {
        const browser = await playwrightModule.chromium.launch({
          headless: true,
          ...(channel ? { channel } : {}),
          timeout: 15_000,
        });
        return {
          provider: new PlaywrightBrowserProvider(browser as never),
          note: `Playwright aktif memakai ${channel || "Chromium bawaan"}.`,
        };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    return {
      provider: new FetchBrowserProvider(),
      note: `Playwright terpasang tetapi browser tidak dapat diluncurkan (${failures[0] || "unknown"}); fallback fetch dipakai.`,
    };
  } catch {
    return {
      provider: new FetchBrowserProvider(),
      note: "Playwright tidak terpasang; navigasi memakai fetch HTTP untuk halaman publik.",
    };
  }
}

function classifyPage(url: string, text: string, requiresAuth: boolean): ChallengePageType {
  if (requiresAuth) return "authenticated-challenge";
  if (/^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) return "local-environment";
  if (/\b(ctf\.time|instance|challenge-[a-z0-9]+\.|remote)\b/i.test(url)) return "remote-instance";
  if (/\b(challenge|soal|task|ctf)\b/i.test(text) || /\/challenges?\//i.test(url)) return "public-challenge";
  return "unrelated";
}

/** Reads authorized pages as untrusted data. It never follows embedded instructions. */
export class AuthorizedWebNavigator {
  constructor(private readonly provider: BrowserProvider = new FetchBrowserProvider()) {}

  get providerName(): string {
    return this.provider.name;
  }

  async open(url: string, officialUrl: string, context: PlatformRequestContext): Promise<WebPageSnapshot> {
    const snapshot = await this.provider.open(url, officialUrl, context);
    const requiresAuth = /\b(sign\s*in|log\s*in|masuk|password|kata\s*sandi|captcha)\b/i.test(snapshot.text);
    const artifactLinks = snapshot.links.filter((link) => /\.(zip|tar|gz|tgz|png|jpg|jpeg|gif|pdf|pcap|pcapng|bin|elf|py|txt|wav|mp3|exe|dll)(\?|$)/i.test(link));
    const hintLines = snapshot.text
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((line) => /\b(hint|petunjuk|clue)\b/i.test(line))
      .slice(0, 20);
    const untrustedInstructions = snapshot.text
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((line) => /\b(ignore previous|abaikan instruksi|run this command|jalankan perintah|sudo|curl .*\|.*sh)\b/i.test(line))
      .slice(0, 10);
    return {
      url: snapshot.url,
      title: snapshot.title,
      text: snapshot.text,
      links: snapshot.links,
      artifacts: artifactLinks,
      hints: hintLines,
      pageType: classifyPage(snapshot.url, snapshot.text, requiresAuth),
      requiresAuth,
      untrustedInstructions,
      untrusted: true,
    };
  }

  async close(): Promise<void> {
    await this.provider.close?.();
  }
}
