"use client";

import { useCallback, useState } from "react";
import { ExternalLink, History, Loader2, Search, ShieldCheck } from "lucide-react";
import { Badge, ErrorBanner, Field, PageHeader, Panel, Toggle } from "./ui";
import type {
  ChallengeIdentity,
  PublicResearchSettings,
  ResearchEvent,
  ResearchFinalAnswer,
  ResearchProvider,
  ResearchSession,
  ResearchStatus,
} from "@/lib/ctf/research/types";

interface SourceView {
  url: string;
  title: string;
  retrieved: boolean;
  score: number;
  tier: string;
  candidateCount: number;
}

interface CandidateView {
  value: string;
  sources: number;
  exactSources: number;
}

interface ProviderView {
  provider: string;
  status: string;
  count: number;
  message: string;
}

const STATUS_TONE: Record<ResearchStatus, "green" | "cyan" | "amber" | "rose" | "violet"> = {
  VERIFIED: "green",
  "MULTI-SOURCE CONFIRMED": "green",
  "SOURCE CONFIRMED": "cyan",
  "HIGH CONFIDENCE": "violet",
  CONFLICTING: "rose",
  UNVERIFIED: "amber",
};

function safeEventText(event: Record<string, unknown>): string {
  const type = typeof event.type === "string" ? event.type : "event";
  if (typeof event.message === "string") return `${type}: ${event.message.slice(0, 300)}`;
  if (typeof event.command === "string") return `${type}: ${event.command.slice(0, 300)}`;
  if (typeof event.output === "string") return `${type}: ${event.output.slice(0, 300)}`;
  return `${type}: ${JSON.stringify(event).slice(0, 300)}`;
}

export function ResearchDashboard({
  initialSessions,
  initialSettings,
}: {
  initialSessions: ResearchSession[];
  initialSettings: PublicResearchSettings;
}) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("picoCTF");
  const [category, setCategory] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [writeupUrls, setWriteupUrls] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [allowFallback, setAllowFallback] = useState(true);
  const [confirmNetwork, setConfirmNetwork] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("Menunggu input.");
  const [identity, setIdentity] = useState<ChallengeIdentity | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [answer, setAnswer] = useState<ResearchFinalAnswer | null>(null);
  const [fallbackReason, setFallbackReason] = useState("");
  const [solverLog, setSolverLog] = useState<string[]>([]);
  const [researchId, setResearchId] = useState("");
  const [history, setHistory] = useState<ResearchSession[]>(initialSessions);
  const [settings, setSettings] = useState<PublicResearchSettings>(initialSettings);
  const [apiKey, setApiKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [cx, setCx] = useState(initialSettings.cx || "");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/ctf/research", { cache: "no-store" });
      const payload = (await response.json()) as { sessions?: ResearchSession[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Gagal memuat riwayat.");
      setHistory(payload.sessions || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  const applyEvent = useCallback((event: ResearchEvent) => {
    switch (event.type) {
      case "stage":
        setStage(event.message);
        break;
      case "identity":
        setIdentity(event.identity);
        break;
      case "query":
        setQueries((current) => [...current, `${event.provider}: ${event.query}`]);
        break;
      case "provider":
        setProviders((current) => [
          ...current,
          { provider: event.provider, status: event.status, count: event.count, message: event.message },
        ]);
        break;
      case "source":
        setSources((current) => [
          ...current,
          {
            url: event.url,
            title: event.title,
            retrieved: event.retrieved,
            score: event.score,
            tier: event.tier,
            candidateCount: event.candidateCount,
          },
        ]);
        break;
      case "candidate":
        setCandidates((current) => [
          ...current.filter((item) => item.value !== event.value),
          { value: event.value, sources: event.sources, exactSources: event.exactSources },
        ]);
        break;
      case "status":
        setStatus(event.status);
        break;
      case "answer":
        setAnswer(event.answer);
        break;
      case "fallback":
        setFallbackReason(event.reason);
        break;
      case "solver-event":
        setSolverLog((current) => [...current, safeEventText(event.event)].slice(-120));
        break;
      case "solver-answer":
        setSolverLog((current) => [...current, `${event.status}: ${event.note}\n${event.answer}`].slice(-120));
        break;
      case "error":
        setError(event.message);
        break;
      case "done":
        setResearchId(event.sessionId);
        break;
    }
  }, []);

  const loadSession = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ctf/research?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = (await response.json()) as { session?: ResearchSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "Sesi tidak ditemukan.");
      setTitle(payload.session.input.title);
      setPlatform(payload.session.input.platform);
      setCategory(payload.session.input.category);
      setUrl(payload.session.input.url);
      setDescription(payload.session.input.description);
      setWriteupUrls((payload.session.input.seedUrls || []).join("\n"));
      setQueries([]);
      setProviders([]);
      setSources([]);
      setCandidates([]);
      setSolverLog([]);
      setAnswer(null);
      setStatus(payload.session.status);
      setResearchId(payload.session.id);
      setStage("Sesi tersimpan dimuat.");
      for (const event of payload.session.events) applyEvent(event);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError("");
    setStage("Memulai riset.");
    setIdentity(null);
    setQueries([]);
    setProviders([]);
    setSources([]);
    setCandidates([]);
    setStatus(null);
    setAnswer(null);
    setFallbackReason("");
    setSolverLog([]);
    setResearchId("");
    try {
      const response = await fetch("/api/ctf/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          platform,
          category,
          url,
          description,
          seedUrls: writeupUrls
            .split(/[\n,;\s]+/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8),
          sessionId: sessionId.trim() || undefined,
          allowFallback,
          confirmNetworkAction: confirmNetwork,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            applyEvent(JSON.parse(line) as ResearchEvent);
          } catch {
            // Ignore malformed stream lines instead of pretending progress.
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setStage((current) => (current === "Memulai riset." ? "Riset selesai." : current));
      void loadHistory();
    }
  };

  const saveSettings = async () => {
    setSettingsBusy(true);
    setSettingsMessage("");
    try {
      const response = await fetch("/api/ctf/research/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings?.provider || "github",
          enabled: settings?.enabled || false,
          cx,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(githubToken.trim() ? { githubToken: githubToken.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as { settings?: PublicResearchSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error || "Gagal menyimpan.");
      setSettings(payload.settings);
      setCx(payload.settings.cx || "");
      setApiKey("");
      setGithubToken("");
      setSettingsMessage("Pengaturan penyedia disimpan. Kunci tidak ditampilkan kembali.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSettingsBusy(false);
    }
  };

  const clearKeys = async () => {
    setSettingsBusy(true);
    try {
      const response = await fetch("/api/ctf/research/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearKey: true, clearGithubToken: true }),
      });
      const payload = (await response.json()) as { settings?: PublicResearchSettings };
      if (payload.settings) setSettings(payload.settings);
      setSettingsMessage("Kunci tersimpan dihapus.");
    } finally {
      setSettingsBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="ANSWER DISCOVERY ENGINE"
        title="Write-up research & verification"
        description="Cari solusi publik terlebih dahulu, cocokkan identitas challenge, ekstrak flag dari sumber asli, lalu verifikasi lintas sumber. Fallback ke solver otomatis bila riset tidak meyakinkan."
        actions={
          <button type="button" className="ctf-btn" onClick={() => void loadHistory()}>
            <History size={13} /> Muat ulang riwayat
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="Identitas challenge" subtitle="Judul dan platform adalah input wajib. Field lain bersifat opsional dan tidak diarang-ang.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Challenge">
                <input className="ctf-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Mis. Basic File Exploitation" />
              </Field>
              <Field label="Platform">
                <input className="ctf-input" value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="picoCTF" />
              </Field>
              <Field label="Kategori (opsional)">
                <input className="ctf-input" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Web Exploitation" />
              </Field>
              <Field label="URL challenge (opsional)">
                <input className="ctf-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
              </Field>
              <Field label="Sesi chat untuk fallback (opsional)" hint="Isi jika ingin solver otomatis berjalan saat riset gagal.">
                <input className="ctf-input ctf-mono" value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="sesi_..." />
              </Field>
              <Field label="Validator resmi" hint="Khusus operator: bukti penerimaan server dapat menaikkan status menjadi VERIFIED.">
                <span className="text-[10.5px] text-[var(--ctf-dim)]">Gunakan field officialValidation lewat API bila tersedia.</span>
              </Field>
            </div>
            <Field label="URL write-up publik yang sudah diketahui (opsional)" hint="Satu URL per baris. Diambil langsung dari sumber asli tanpa API pencarian. Domain privat/local ditolak.">
              <textarea
                className="ctf-input ctf-mono min-h-20"
                value={writeupUrls}
                onChange={(event) => setWriteupUrls(event.target.value)}
                placeholder={"https://medium.com/...@user/writeup\nhttps://raahguu.dev/writeups/2026/picoctf/bytemancy-1/"}
              />
            </Field>
            <Field label="Deskripsi / teks soal (opsional)">
              <textarea
                className="ctf-input min-h-24"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Tempel deskripsi challenge agar pencocokan lebih kuat."
              />
            </Field>
            <div className="mt-2 space-y-2">
              <Toggle
                checked={allowFallback}
                onChange={setAllowFallback}
                label="Fallback otomatis ke solver"
                description="Jalankan solver Kali lokal bila tidak ada write-up yang memenuhi ambang verifikasi."
              />
              <Toggle
                checked={confirmNetwork}
                onChange={setConfirmNetwork}
                label="Izinkan aksi jaringan fallback"
                description="Hanya centang untuk instance challenge milik Anda."
                danger
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="ctf-btn ctf-btn-primary" onClick={() => void start()} disabled={busy || title.trim().length < 2 || platform.trim().length < 1}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {busy ? "Meneliti..." : "Mulai riset"}
              </button>
              {researchId && <span className="ctf-mono text-[10px] text-[var(--ctf-dim)]">ID: {researchId}</span>}
            </div>
          </Panel>

          <Panel title="Sumber & kecocokan" subtitle="Hanya sumber yang benar-benar diambil yang ditampilkan. Skor 95+ exact, 85+ strong, 70+ potential.">
            {sources.length === 0 ? (
              <p className="text-[11px] text-[var(--ctf-dim)]">Belum ada sumber yang diambil.</p>
            ) : (
              <div className="space-y-2">
                {sources.map((source, index) => (
                  <div key={`${source.url}-${index}`} className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <a className="text-[11.5px] text-[#67e8f9] hover:underline" href={source.url} target="_blank" rel="noreferrer noopener">
                        {source.title || source.url} <ExternalLink size={10} className="inline" />
                      </a>
                      <div className="flex gap-1.5">
                        <Badge tone={source.tier === "exact" ? "green" : source.tier === "strong" ? "cyan" : source.tier === "potential" ? "violet" : "amber"}>{source.tier}</Badge>
                        <Badge tone={source.retrieved ? "green" : "rose"}>{source.score}/100</Badge>
                      </div>
                    </div>
                    <p className="ctf-mono mt-1 truncate text-[9.5px] text-[var(--ctf-dim)]">{source.url}</p>
                    <p className="mt-1 text-[10px] text-[var(--ctf-muted)]">
                      {source.retrieved ? "Halaman diambil" : "Gagal diambil"} · {source.candidateCount} kandidat flag
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Kandidat flag" subtitle="Kandidat tidak otomatis menjadi jawaban terverifikasi.">
            {candidates.length === 0 ? (
              <p className="text-[11px] text-[var(--ctf-dim)]">Belum ada kandidat.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {candidates.map((candidate) => (
                  <div key={candidate.value} className="rounded-md border border-[rgba(52,211,153,0.25)] bg-[rgba(6,78,59,0.15)] px-2 py-1.5">
                    <span className="ctf-mono text-[10.5px] text-[#a7f3d0]">{candidate.value}</span>
                    <span className="ml-2 text-[9px] text-[var(--ctf-dim)]">{candidate.exactSources} kuat / {candidate.sources} sumber</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Jawaban akhir" subtitle="Format ringkas: challenge, platform, answer, status, method, solution, sources, verification.">
            {answer ? (
              <pre className="ctf-mono whitespace-pre-wrap break-words rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.55)] p-3 text-[10.5px] leading-relaxed text-[#d1fae5]">
                {answer.formatted}
              </pre>
            ) : (
              <p className="text-[11px] text-[var(--ctf-dim)]">Belum ada jawaban yang dapat dilaporkan.</p>
            )}
          </Panel>

          {solverLog.length > 0 && (
            <Panel title="Fallback solver otonom" subtitle="Output ini berasal dari solver lokal, bukan dari validator resmi.">
              <div className="max-h-72 space-y-1 overflow-auto">
                {solverLog.map((line, index) => (
                  <pre key={index} className="ctf-mono whitespace-pre-wrap break-words text-[9.5px] text-[var(--ctf-muted)]">{line}</pre>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Progres live" subtitle="Nilai yang ditampilkan berasal dari event nyata.">
            <div className="space-y-2 text-[10.5px]">
              <div className="flex items-center justify-between gap-2"><span className="text-[var(--ctf-muted)]">Tahap</span><span className="text-right text-[#a7f3d0]">{stage}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-[var(--ctf-muted)]">Status</span>{status ? <Badge tone={STATUS_TONE[status]}>{status}</Badge> : <Badge tone="amber">BELUM ADA</Badge>}</div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Query</span><span className="ctf-mono">{queries.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Sumber</span><span className="ctf-mono">{sources.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Kandidat</span><span className="ctf-mono">{candidates.length}</span></div>
              {identity && <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Identitas</span><Badge tone={identity.ambiguous ? "amber" : "green"}>{identity.identity_confidence}</Badge></div>}
            </div>
            {fallbackReason && (
              <p className="mt-3 rounded border border-[rgba(251,191,36,0.28)] bg-[rgba(69,45,5,0.15)] p-2 text-[9.5px] leading-relaxed text-[#fde68a]">
                Fallback: {fallbackReason}
              </p>
            )}
          </Panel>

          <Panel title="Identitas challenge" subtitle="Dibangun hanya dari input operator.">
            {identity ? (
              <div className="space-y-1.5 text-[10px]">
                <div><span className="text-[var(--ctf-muted)]">Judul:</span> {identity.challenge_title}</div>
                <div><span className="text-[var(--ctf-muted)]">Platform:</span> {identity.platform || "—"}</div>
                <div><span className="text-[var(--ctf-muted)]">Event/tahun:</span> {[identity.event, identity.year].filter(Boolean).join(" ") || "—"}</div>
                <div><span className="text-[var(--ctf-muted)]">Kategori:</span> {identity.category || "—"}</div>
                <div><span className="text-[var(--ctf-muted)]">Format flag:</span> {identity.flag_format || "tidak diketahui"}</div>
                {identity.notes.map((note, index) => <p key={index} className="text-[9px] text-[var(--ctf-dim)]">• {note}</p>)}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--ctf-dim)]">Belum dibangun.</p>
            )}
          </Panel>

          <Panel title="Query & penyedia" subtitle="Pencarian GitHub API selalu dipakai; penyedia web hanya bila key diisi.">
            <div className="space-y-1.5">
              {providers.map((provider, index) => (
                <div key={index} className="rounded border border-[var(--ctf-line)] p-2 text-[9.5px]">
                  <div className="flex items-center justify-between"><span className="ctf-mono text-[#a7f3d0]">{provider.provider}</span><Badge tone={provider.status === "ok" ? "green" : provider.status === "error" ? "rose" : "amber"}>{provider.status} · {provider.count}</Badge></div>
                  <p className="mt-1 text-[var(--ctf-dim)]">{provider.message}</p>
                </div>
              ))}
              {queries.length > 0 && (
                <details className="text-[9.5px] text-[var(--ctf-muted)]">
                  <summary className="cursor-pointer">{queries.length} query dijalankan</summary>
                  <ol className="mt-1 space-y-1">{queries.map((query, index) => <li key={index} className="ctf-mono break-words">{index + 1}. {query}</li>)}</ol>
                </details>
              )}
            </div>
          </Panel>

          <Panel title="Penyedia pencarian" subtitle="Kunci disimpan terenkripsi menggunakan master key aplikasi dan tidak dikembalikan ke UI.">
            {settings && (
              <div className="space-y-2">
                <Field label="Penyedia web API">
                  <select
                    className="ctf-select"
                    value={settings.provider}
                    onChange={(event) => setSettings({ ...settings, provider: event.target.value as ResearchProvider })}
                  >
                    <option value="github">GitHub public API saja</option>
                    <option value="brave">Brave Search API</option>
                    <option value="googleCse">Google Custom Search JSON API</option>
                  </select>
                </Field>
                <Toggle
                  checked={settings.enabled}
                  onChange={(value) => setSettings({ ...settings, enabled: value })}
                  label="Aktifkan pencarian web berbayar/API"
                  description="Tanpa key, aplikasi hanya memakai GitHub public API."
                />
                {settings.provider !== "github" && (
                  <>
                    <Field label="API key" hint={settings.hasKey ? "Kunci tersimpan. Kosongkan untuk tidak mengubah." : "Belum ada kunci tersimpan."}>
                      <input className="ctf-input ctf-mono" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
                    </Field>
                    {settings.provider === "googleCse" && (
                      <Field label="CSE cx">
                        <input className="ctf-input ctf-mono" value={cx} onChange={(event) => setCx(event.target.value)} />
                      </Field>
                    )}
                  </>
                )}
                <Field label="GitHub token (opsional)" hint={settings.hasGithubToken ? "Token tersimpan untuk rate limit lebih tinggi." : "Tidak wajib."}>
                  <input className="ctf-input ctf-mono" type="password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} autoComplete="off" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ctf-btn ctf-btn-primary" onClick={() => void saveSettings()} disabled={settingsBusy}>
                    {settingsBusy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Simpan kunci
                  </button>
                  <button type="button" className="ctf-btn" onClick={() => void clearKeys()} disabled={settingsBusy}>Hapus kunci</button>
                </div>
                {settingsMessage && <p className="text-[10px] text-[#a7f3d0]">{settingsMessage}</p>}
              </div>
            )}
          </Panel>

          <Panel title="Riwayat sesi" subtitle="Sesi riset disimpan lokal tanpa kredensial.">
            {history.length === 0 ? (
              <p className="text-[11px] text-[var(--ctf-dim)]">Belum ada sesi.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-2 rounded border border-[var(--ctf-line)] p-2 text-left hover:border-[rgba(52,211,153,0.4)]"
                    onClick={() => void loadSession(session.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[10.5px] text-[#a7f3d0]">{session.identity.challenge_title || session.input.title}</span>
                      <span className="ctf-mono block text-[9px] text-[var(--ctf-dim)]">{session.id}</span>
                    </span>
                    <Badge tone={STATUS_TONE[session.status]}>{session.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
