"use client";

import { useState } from "react";
import { Badge, Panel, PageHeader } from "@/components/ctf/ui";
import type { PlatformConnectionRecord } from "@/lib/ctf/types";

export interface PlatformView {
  id: string;
  name: string;
  officialUrl: string;
  supportsOfficialApi: boolean;
  requiresUserSession: boolean;
  capabilities: string[];
}

interface ChallengeView {
  id: string;
  title: string;
  url: string;
  description?: string;
  categories?: string[];
  difficulty?: string;
  hints?: string[];
  artifacts?: string[];
  officialApi: boolean;
}

interface DiscoveryResult {
  platform: string;
  platformName: string;
  officialUrl: string;
  authorization: string;
  usedOfficialApi: boolean;
  challenges: ChallengeView[];
  limitations: string[];
  retrievedAt: string;
}

export function PlatformDiscovery({
  platforms,
  connections,
}: {
  platforms: PlatformView[];
  connections: PlatformConnectionRecord[];
}) {
  const [platform, setPlatform] = useState(platforms[0]?.id || "ctfd");
  const [authorized, setAuthorized] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [sessionCookie, setSessionCookie] = useState("");
  const [useBrowser, setUseBrowser] = useState(false);
  const [maxChallenges, setMaxChallenges] = useState(20);
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [page, setPage] = useState<{ title: string; text: string; pageType: string; untrustedInstructions: string[]; providerNote?: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = platforms.find((item) => item.id === platform);

  async function discover() {
    setError("");
    setBusy(true);
    setResults([]);
    try {
      const response = await fetch("/api/ctf/platforms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          platform,
          authorized,
          authorization: token || sessionCookie ? "user-session" : "public",
          ...(token ? { token } : {}),
          ...(sessionCookie ? { sessionCookie } : {}),
          ...(baseUrl ? { officialBaseUrl: baseUrl } : {}),
          maxChallenges,
        }),
      });
      const payload = (await response.json()) as { results?: DiscoveryResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Penemuan platform gagal.");
      setResults(payload.results || []);
      setToken("");
      setSessionCookie("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function readPage(challenge: ChallengeView, officialUrl: string) {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/ctf/web/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: challenge.url,
          officialUrl,
          authorized: true,
          authorization: sessionCookie ? "user-session" : "public",
          ...(sessionCookie ? { sessionCookie } : {}),
          useBrowser,
        }),
      });
      const payload = (await response.json()) as {
        title?: string;
        text?: string;
        pageType?: string;
        untrustedInstructions?: string[];
        providerNote?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Gagal membaca halaman.");
      setPage({
        title: payload.title || challenge.title,
        text: payload.text || "",
        pageType: payload.pageType || "unrelated",
        untrustedInstructions: payload.untrustedInstructions || [],
        providerNote: payload.providerNote,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="PLATFORM"
        title="Platform Discovery"
        description="Penemuan tantangan publik/terautorisasi dari platform CTF resmi."
      />
      <Panel title="Koneksi platform" subtitle="Hanya origin resmi; tidak ada login otomatis, CAPTCHA, atau submit otomatis.">
        <div className="grid gap-3 md:grid-cols-2">
          {platforms.map((item) => (
            <div key={item.id} className="rounded-lg border border-[var(--ctf-line)] p-3 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{item.name}</strong>
                <Badge tone={item.supportsOfficialApi ? "green" : "violet"}>
                  {item.supportsOfficialApi ? "Official API" : "Public page"}
                </Badge>
                {item.requiresUserSession ? <Badge tone="amber">Perlu sesi</Badge> : null}
              </div>
              <p className="mt-1 break-all text-[9.5px] text-[var(--ctf-muted)]">{item.officialUrl}</p>
              <p className="mt-0.5 text-[9.5px] text-[var(--ctf-dim)]">
                {item.capabilities.join(" · ")}
              </p>
            </div>
          ))}
        </div>
        {connections.length ? (
          <p className="mt-3 text-[10px] text-[var(--ctf-muted)]">
            Tersimpan: {connections.map((item) => `${item.platformName} (${item.challengeCount} challenge)`).join(", ")}
          </p>
        ) : null}
      </Panel>

      <Panel title="Penemuan terautorisasi">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-[11px]">
            Platform
            <select
              className="ctf-input mt-1 w-full"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            >
              {platforms.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px]">
            Base URL instance (opsional)
            <input
              className="ctf-input mt-1 w-full"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={selected?.officialUrl || "https://ctfd.io"}
            />
          </label>
          <label className="text-[11px]">
            Token resmi pengguna (opsional, tidak disimpan)
            <input
              type="password"
              className="ctf-input mt-1 w-full"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="text-[11px]">
            Cookie sesi resmi (opsional, tidak disimpan)
            <input
              type="password"
              className="ctf-input mt-1 w-full"
              value={sessionCookie}
              onChange={(event) => setSessionCookie(event.target.value)}
              placeholder="ctf_session=…"
              autoComplete="off"
            />
          </label>
          <label className="text-[11px]">
            Maksimal challenge
            <input
              type="number"
              min={1}
              max={100}
              className="ctf-input mt-1 w-full"
              value={maxChallenges}
              onChange={(event) => setMaxChallenges(Number(event.target.value))}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={useBrowser} onChange={(event) => setUseBrowser(event.target.checked)} />
          Pakai browser nyata (Playwright/Edge) untuk halaman dinamis
        </label>
        <label className="mt-3 flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
          Saya berwenang mengakses challenge/platform ini.
        </label>
        <div className="mt-3">
          <button
            type="button"
            className="ctf-btn ctf-btn-primary"
            onClick={discover}
            disabled={!authorized || busy}
          >
            {busy ? "Memproses…" : "Temukan challenge"}
          </button>
        </div>
        {error ? <p className="mt-3 text-[11px] text-[#fca5a5]">{error}</p> : null}
      </Panel>

      {results.map((result) => (
        <Panel
          key={`${result.platform}-${result.retrievedAt}`}
          title={`${result.platformName} — ${result.challenges.length} challenge`}
          subtitle={`${result.usedOfficialApi ? "Official API" : "Halaman publik"} · diambil ${result.retrievedAt}`}
        >
          {result.limitations.length ? (
            <p className="mb-3 text-[10px] text-[var(--ctf-muted)]">
              Batasan: {result.limitations.join("; ")}
            </p>
          ) : null}
          <div className="space-y-2">
            {result.challenges.map((challenge) => (
              <div key={challenge.id} className="rounded-lg border border-[var(--ctf-line)] p-3 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{challenge.title}</strong>
                  {challenge.difficulty ? <Badge tone="violet">{challenge.difficulty}</Badge> : null}
                  {challenge.categories?.map((category) => <Badge key={category} tone="cyan">{category}</Badge>)}
                </div>
                <p className="mt-1 break-all text-[9.5px] text-[var(--ctf-muted)]">{challenge.url}</p>
                {challenge.description ? (
                  <p className="mt-1 line-clamp-3 text-[10px] text-[var(--ctf-dim)]">{challenge.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {challenge.artifacts?.length ? (
                    <Badge tone="green">{challenge.artifacts.length} artefak</Badge>
                  ) : null}
                  {challenge.hints?.length ? <Badge tone="amber">{challenge.hints.length} hint</Badge> : null}
                  <button
                    type="button"
                    className="ctf-btn"
                    onClick={() => readPage(challenge, result.officialUrl)}
                    disabled={busy}
                  >
                    Baca halaman
                  </button>
                </div>
              </div>
            ))}
            {!result.challenges.length ? (
              <p className="text-[11px] text-[var(--ctf-muted)]">
                Tidak ada challenge publik yang dapat dibaca dengan autorisasi ini.
              </p>
            ) : null}
          </div>
        </Panel>
      ))}

      {page ? (
        <Panel title={`Halaman: ${page.title}`} subtitle={`Jenis: ${page.pageType} · konten tidak tepercaya${page.providerNote ? ` · ${page.providerNote}` : ""}`}>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[10px] text-[var(--ctf-muted)]">
            {page.text.slice(0, 12_000)}
          </pre>
          {page.untrustedInstructions.length ? (
            <p className="mt-2 text-[10px] text-[#fca5a5]">
              Instruksi tersisip diabaikan: {page.untrustedInstructions.join(" | ")}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
