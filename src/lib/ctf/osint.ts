import dns from "node:dns/promises";
import { inspectTls, safeFetch } from "./http";

export interface DnsRecordSet {
  domain: string;
  a: string[];
  aaaa: string[];
  cname: string[];
  mx: Array<{ exchange: string; priority: number }>;
  ns: string[];
  txt: string[];
  soa?: { nsname: string; hostmaster: string; serial: number };
  errors: string[];
}

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function assertDomain(domain: string): string {
  const value = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!DOMAIN_PATTERN.test(value)) {
    throw new Error("Domain tidak valid. Gunakan format example.com tanpa path.");
  }
  return value;
}

export async function dnsRecon(domain: string): Promise<DnsRecordSet> {
  const target = assertDomain(domain);
  const result: DnsRecordSet = {
    domain: target,
    a: [],
    aaaa: [],
    cname: [],
    mx: [],
    ns: [],
    txt: [],
    errors: [],
  };
  const capture = async <T>(label: string, operation: Promise<T>, apply: (value: T) => void) => {
    try {
      apply(await operation);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENODATA" && code !== "ENOTFOUND" && code !== "ESERVFAIL") {
        result.errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all([
    capture("A", dns.resolve4(target), (value) => {
      result.a = value;
    }),
    capture("AAAA", dns.resolve6(target), (value) => {
      result.aaaa = value;
    }),
    capture("CNAME", dns.resolveCname(target), (value) => {
      result.cname = value;
    }),
    capture("MX", dns.resolveMx(target), (value) => {
      result.mx = value.map((item) => ({ exchange: item.exchange, priority: item.priority }));
    }),
    capture("NS", dns.resolveNs(target), (value) => {
      result.ns = value;
    }),
    capture("TXT", dns.resolveTxt(target), (value) => {
      result.txt = value.map((parts) => parts.join(""));
    }),
    capture("SOA", dns.resolveSoa(target), (value) => {
      result.soa = { nsname: value.nsname, hostmaster: value.hostmaster, serial: value.serial };
    }),
  ]);
  return result;
}

export interface RdapSummary {
  ok: boolean;
  source: string;
  handle?: string;
  name?: string;
  status?: string[];
  registrar?: string;
  events?: Array<{ action: string; date: string }>;
  nameservers?: string[];
  error?: string;
}

export async function rdapDomain(domain: string): Promise<RdapSummary> {
  const target = assertDomain(domain);
  const source = `https://rdap.org/domain/${encodeURIComponent(target)}`;
  try {
    const response = await safeFetch(source, { timeoutMs: 15_000, maxBytes: 800_000 });
    if (response.status === 404) {
      return { ok: true, source, error: "Domain tidak ditemukan pada RDAP (mungkin belum terdaftar)." };
    }
    if (response.status !== 200) {
      return { ok: false, source, error: `RDAP HTTP ${response.status}` };
    }
    const data = JSON.parse(response.bodyPreview) as {
      handle?: string;
      ldhName?: string;
      status?: string[];
      nameservers?: Array<{ ldhName?: string }>;
      events?: Array<{ eventAction?: string; eventDate?: string }>;
      entities?: Array<{
        roles?: string[];
        vcardArray?: unknown[];
        handle?: string;
      }>;
    };
    const registrarEntity = (data.entities || []).find((entity) =>
      (entity.roles || []).includes("registrar"),
    );
    let registrar = registrarEntity?.handle;
    const vcard = registrarEntity?.vcardArray?.[1];
    if (Array.isArray(vcard)) {
      const fn = vcard.find((entry) => Array.isArray(entry) && entry[0] === "fn");
      if (Array.isArray(fn) && typeof fn[3] === "string") registrar = fn[3];
    }
    return {
      ok: true,
      source,
      handle: data.handle,
      name: data.ldhName,
      status: data.status,
      registrar,
      events: (data.events || [])
        .filter((event) => event.eventAction && event.eventDate)
        .map((event) => ({ action: String(event.eventAction), date: String(event.eventDate) })),
      nameservers: (data.nameservers || [])
        .map((server) => server.ldhName)
        .filter((value): value is string => Boolean(value)),
    };
  } catch (error) {
    return {
      ok: false,
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface UsernameProfile {
  site: string;
  url: string;
  status: "found" | "not-found" | "unchecked" | "error";
  detail: string;
}

const USERNAME_SITES: Array<{ site: string; url: (username: string) => string }> = [
  { site: "GitHub", url: (username) => `https://github.com/${encodeURIComponent(username)}` },
  { site: "GitLab", url: (username) => `https://gitlab.com/${encodeURIComponent(username)}` },
  { site: "Reddit", url: (username) => `https://www.reddit.com/user/${encodeURIComponent(username)}` },
  { site: "HackerOne", url: (username) => `https://hackerone.com/${encodeURIComponent(username)}` },
  { site: "Keybase", url: (username) => `https://keybase.io/${encodeURIComponent(username)}` },
  { site: "Mastodon (social)", url: (username) => `https://mastodon.social/@${encodeURIComponent(username)}` },
  { site: "Docker Hub", url: (username) => `https://hub.docker.com/u/${encodeURIComponent(username)}` },
  { site: "Medium", url: (username) => `https://medium.com/@${encodeURIComponent(username)}` },
];

export interface UsernameRecon {
  username: string;
  checkedAt: string;
  profiles: UsernameProfile[];
  note: string;
}

export async function usernameRecon(username: string): Promise<UsernameRecon> {
  const handle = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,38}$/.test(handle)) {
    throw new Error("Username tidak valid (2–39 karakter, huruf/angka/._-).");
  }
  const profiles: UsernameProfile[] = USERNAME_SITES.map((site) => ({
    site: site.site,
    url: site.url(handle),
    status: "unchecked",
    detail: "URL dibuat; belum diperiksa untuk menghindari scraping.",
  }));

  const set = (site: string, status: UsernameProfile["status"], detail: string) => {
    const profile = profiles.find((item) => item.site === site);
    if (profile) {
      profile.status = status;
      profile.detail = detail;
    }
  };

  try {
    const github = await safeFetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, {
      timeoutMs: 10_000,
      maxBytes: 200_000,
      headers: { accept: "application/vnd.github+json" },
    });
    if (github.status === 200) set("GitHub", "found", "API GitHub mengembalikan profil publik.");
    else if (github.status === 404) set("GitHub", "not-found", "API GitHub: 404.");
    else set("GitHub", "error", `API GitHub: HTTP ${github.status}.`);
  } catch (error) {
    set("GitHub", "error", error instanceof Error ? error.message : String(error));
  }

  try {
    const gitlab = await safeFetch(
      `https://gitlab.com/api/v4/users?username=${encodeURIComponent(handle)}`,
      { timeoutMs: 10_000, maxBytes: 200_000 },
    );
    if (gitlab.status === 200) {
      const data = JSON.parse(gitlab.bodyPreview) as unknown[];
      set(
        "GitLab",
        data.length ? "found" : "not-found",
        data.length ? "API GitLab mengembalikan pengguna." : "API GitLab: tidak ada pengguna.",
      );
    } else {
      set("GitLab", "error", `API GitLab: HTTP ${gitlab.status}.`);
    }
  } catch (error) {
    set("GitLab", "error", error instanceof Error ? error.message : String(error));
  }

  return {
    username: handle,
    checkedAt: new Date().toISOString(),
    profiles,
    note: "Hanya GitHub dan GitLab yang diperiksa melalui API publik. Situs lain hanya berupa URL untuk verifikasi manual; tidak ada scraping atau login.",
  };
}

export interface DomainRecon {
  domain: string;
  dns: DnsRecordSet;
  rdap: RdapSummary;
  tls?: Awaited<ReturnType<typeof inspectTls>>;
  tlsError?: string;
  http?: {
    url: string;
    status: number;
    headers: Record<string, string>;
    title?: string;
    server?: string;
    error?: string;
  };
  generatedAt: string;
}

export async function domainRecon(domain: string): Promise<DomainRecon> {
  const target = assertDomain(domain);
  const [dnsResult, rdap] = await Promise.all([dnsRecon(target), rdapDomain(target)]);
  let tlsResult: DomainRecon["tls"];
  let tlsError: string | undefined;
  try {
    tlsResult = await inspectTls(target, 443);
  } catch (error) {
    tlsError = error instanceof Error ? error.message : String(error);
  }
  let httpResult: DomainRecon["http"];
  try {
    const response = await safeFetch(`https://${target}/`, {
      timeoutMs: 12_000,
      maxBytes: 600_000,
    });
    const title = response.bodyPreview.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim();
    httpResult = {
      url: response.finalUrl,
      status: response.status,
      headers: response.headers,
      title,
      server: response.headers.server,
    };
  } catch (error) {
    httpResult = {
      url: `https://${target}/`,
      status: 0,
      headers: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    domain: target,
    dns: dnsResult,
    rdap,
    tls: tlsResult,
    tlsError,
    http: httpResult,
    generatedAt: new Date().toISOString(),
  };
}
