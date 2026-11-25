"use client";

import { useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { Badge, CopyButton, ErrorBanner, Field, PageHeader, Panel } from "./ui";

type Action = "domain" | "dns" | "rdap" | "tls" | "username";

interface DnsRecordSet {
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

interface RdapSummary {
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

interface UsernameProfile {
  site: string;
  url: string;
  status: "found" | "not-found" | "unchecked" | "error";
  detail: string;
}

interface DomainResult {
  domain: string;
  dns: DnsRecordSet;
  rdap: RdapSummary;
  tls?: { address?: string; subject?: string; issuer?: string; validFrom?: string; validTo?: string; san?: string; authorized?: boolean; authorizationError?: string | null };
  tlsError?: string;
  http?: { url: string; status: number; title?: string; server?: string; error?: string };
  generatedAt: string;
}

const ACTIONS: Array<{ id: Action; label: string; placeholder: string; hint: string }> = [
  { id: "domain", label: "Domain recon", placeholder: "example.com", hint: "DNS + RDAP + TLS + HTTP title dalam satu laporan." },
  { id: "dns", label: "DNS records", placeholder: "example.com", hint: "A, AAAA, CNAME, MX, NS, TXT, SOA." },
  { id: "rdap", label: "RDAP", placeholder: "example.com", hint: "Registrar, status, event, nameserver via rdap.org." },
  { id: "tls", label: "TLS certificate", placeholder: "example.com", hint: "Sertifikat publik dan validitas." },
  { id: "username", label: "Username", placeholder: "username", hint: "Cek GitHub & GitLab API; sisanya URL manual." },
];

export function OsintLab() {
  const [action, setAction] = useState<Action>("domain");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ctf/osint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const payload = (await response.json()) as { result?: unknown; error?: string };
      if (!response.ok || payload.result === undefined) throw new Error(payload.error || "OSINT gagal.");
      setResult(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const active = ACTIONS.find((item) => item.id === action)!;

  return (
    <div>
      <PageHeader
        eyebrow="OSINT LAB"
        title="Public information reconnaissance"
        description="DNS, RDAP, sertifikat TLS, header HTTP, dan keberadaan username publik. Hanya sumber publik; tidak ada scraping login atau data privat."
        actions={<Badge tone="cyan">passive recon</Badge>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel title="Target" subtitle={active.hint}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {ACTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="ctf-tab"
                    data-active={action === item.id}
                    onClick={() => {
                      setAction(item.id);
                      setResult(null);
                      setError("");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Field label={action === "username" ? "Username" : "Domain / host"}>
                <input
                  className="ctf-input ctf-mono"
                  placeholder={active.placeholder}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") run();
                  }}
                />
              </Field>
              <button type="button" className="ctf-btn ctf-btn-primary" onClick={run} disabled={busy || !value.trim()}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Radar size={13} />}
                {busy ? "Mengumpulkan…" : "Jalankan recon"}
              </button>
              <ErrorBanner message={error} />
            </div>
          </Panel>

          {result !== null && action === "username" && <UsernameView data={result as { username: string; checkedAt: string; profiles: UsernameProfile[]; note: string }} />}
          {result !== null && action === "dns" && <DnsView data={result as DnsRecordSet} />}
          {result !== null && action === "rdap" && <RdapView data={result as RdapSummary} />}
          {result !== null && action === "tls" && <TlsView data={result as Record<string, unknown>} />}
          {result !== null && action === "domain" && <DomainView data={result as DomainResult} />}
        </div>

        <div className="space-y-4">
          <Panel title="Etika & batasan" noPadding>
            <div className="space-y-2 p-4 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
              <p>• Hanya gunakan pada target yang Anda miliki atau diizinkan.</p>
              <p>• Tidak ada port scanning agresif atau eksploitasi otomatis.</p>
              <p>• Username hanya diverifikasi lewat API resmi GitHub dan GitLab.</p>
              <p>• Hasil dapat berubah; catat waktu pemeriksaan.</p>
              <p>• Data pribadi tidak disimpan ke dalam laporan kecuali Anda memasukkannya.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <div className="relative">
      <div className="absolute right-2 top-2"><CopyButton value={JSON.stringify(value, null, 2)} label="" /></div>
      <pre className="ctf-code ctf-scroll max-h-[420px] whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function DnsView({ data }: { data: DnsRecordSet }) {
  const rows: Array<[string, string]> = [
    ["A", data.a.join(", ")],
    ["AAAA", data.aaaa.join(", ")],
    ["CNAME", data.cname.join(", ")],
    ["MX", data.mx.map((item) => `${item.priority} ${item.exchange}`).join(", ")],
    ["NS", data.ns.join(", ")],
    ["TXT", data.txt.join(" | ")],
    ["SOA", data.soa ? `${data.soa.nsname} · serial ${data.soa.serial}` : ""],
  ];
  return (
    <Panel title={`DNS · ${data.domain}`} subtitle="Query langsung ke resolver sistem.">
      <div className="space-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5 border-b border-[var(--ctf-line)] py-1.5 sm:flex-row sm:justify-between sm:gap-3">
            <span className="ctf-label shrink-0">{key}</span>
            <span className="min-w-0 break-all text-right text-[11px] text-[var(--ctf-muted)]">{value || "—"}</span>
          </div>
        ))}
      </div>
      {data.errors.length > 0 && <ErrorBanner message={data.errors.join(" · ")} />}
    </Panel>
  );
}

function RdapView({ data }: { data: RdapSummary }) {
  if (!data.ok) return <Panel title="RDAP"><ErrorBanner message={data.error || "RDAP gagal."} /></Panel>;
  return (
    <Panel title={`RDAP · ${data.name || "domain"}`} subtitle={data.source}>
      <div className="space-y-1">
        {[
          ["Handle", data.handle],
          ["Registrar", data.registrar],
          ["Status", data.status?.join(", ")],
          ["Nameservers", data.nameservers?.join(", ")],
        ].map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5 border-b border-[var(--ctf-line)] py-1.5 sm:flex-row sm:justify-between sm:gap-3">
            <span className="ctf-label shrink-0">{key}</span>
            <span className="min-w-0 break-all text-right text-[11px] text-[var(--ctf-muted)]">{value || "—"}</span>
          </div>
        ))}
      </div>
      {data.events && data.events.length > 0 && (
        <div className="mt-3">
          <div className="ctf-label mb-1">Events</div>
          <div className="flex flex-wrap gap-1">
            {data.events.map((event) => <Badge key={`${event.action}-${event.date}`} tone="cyan">{event.action}: {event.date.slice(0, 10)}</Badge>)}
          </div>
        </div>
      )}
    </Panel>
  );
}

function TlsView({ data }: { data: Record<string, unknown> }) {
  return (
    <Panel title="TLS certificate" subtitle="Sertifikat dibaca tanpa verifikasi trust chain.">
      <div className="space-y-1">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5 border-b border-[var(--ctf-line)] py-1.5 sm:flex-row sm:justify-between sm:gap-3">
            <span className="ctf-label shrink-0">{key}</span>
            <span className="min-w-0 break-all text-right text-[11px] text-[var(--ctf-muted)]">{String(value ?? "—")}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UsernameView({ data }: { data: { username: string; checkedAt: string; profiles: UsernameProfile[]; note: string } }) {
  const tone = (status: UsernameProfile["status"]) =>
    status === "found" ? "green" : status === "not-found" ? "rose" : status === "error" ? "amber" : "cyan";
  return (
    <Panel title={`Username · ${data.username}`} subtitle={data.note}>
      <div className="space-y-1.5">
        {data.profiles.map((profile) => (
          <div key={profile.site} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] px-2.5 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#d1fae5]">{profile.site}</div>
              <a href={profile.url} target="_blank" rel="noreferrer noopener" className="ctf-mono block truncate text-[9.5px] text-[var(--ctf-cyan)] hover:underline">{profile.url}</a>
              <div className="mt-0.5 text-[9.5px] text-[var(--ctf-dim)]">{profile.detail}</div>
            </div>
            <Badge tone={tone(profile.status)}>{profile.status}</Badge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DomainView({ data }: { data: DomainResult }) {
  return (
    <div className="space-y-4">
      <Panel title={`Domain recon · ${data.domain}`} subtitle={`Dikumpulkan ${data.generatedAt}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
            <div className="ctf-label mb-1">HTTP</div>
            <div className="text-[11px] text-[#d1fae5]">
              {data.http ? `${data.http.status || "ERR"} · ${data.http.title || "(tanpa title)"}` : "—"}
            </div>
            <div className="mt-1 text-[9.5px] text-[var(--ctf-dim)]">{data.http?.server || data.http?.error || ""}</div>
          </div>
          <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
            <div className="ctf-label mb-1">TLS</div>
            <div className="text-[11px] text-[#d1fae5]">{data.tls?.subject || data.tlsError || "—"}</div>
            <div className="mt-1 text-[9.5px] text-[var(--ctf-dim)]">{data.tls?.validTo || ""}</div>
          </div>
        </div>
      </Panel>
      <DnsView data={data.dns} />
      <RdapView data={data.rdap} />
      <Panel title="Raw result" noPadding>
        <div className="p-4"><JsonBlock value={data} /></div>
      </Panel>
    </div>
  );
}
