"use client";

import { useState } from "react";
import { Globe2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, CopyButton, ErrorBanner, Field, PageHeader, Panel } from "./ui";
import { cn, formatBytes } from "@/lib/ctf/format";

interface Inspection {
  url: string;
  finalUrl: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyPreview: string;
  bodyBytes: number;
  bodyTruncated: boolean;
  durationMs: number;
  redirects: string[];
  tls?: {
    subject?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    san?: string;
    fingerprint256?: string;
    authorized?: boolean;
    authorizationError?: string | null;
  };
  remoteAddress?: string;
  warnings: string[];
}

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
];

export function WebLab({ allowPrivateHttp }: { allowPrivateHttp: boolean }) {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "HEAD">("GET");
  const [headerText, setHeaderText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [tab, setTab] = useState<"headers" | "body" | "tls">("headers");

  const inspect = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    setInspection(null);
    try {
      const headers: Record<string, string> = {};
      for (const line of headerText.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const index = trimmed.indexOf(":");
        if (index <= 0) continue;
        headers[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
      }
      const response = await fetch("/api/ctf/http", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, headers }),
      });
      const payload = (await response.json()) as { inspection?: Inspection; error?: string };
      if (!response.ok || !payload.inspection) throw new Error(payload.error || "Inspeksi gagal.");
      setInspection(payload.inspection);
      setTab("headers");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const missing = inspection
    ? SECURITY_HEADERS.filter((header) => !inspection.headers[header])
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="WEB SECURITY LAB"
        title="Authorized HTTP inspector"
        description="Periksa header, redirect, TLS, cookie, dan body dari target yang Anda miliki atau diizinkan. SSRF guard memblokir alamat privat secara default."
        actions={
          <Badge tone={allowPrivateHttp ? "amber" : "green"}>
            <span className="inline-flex items-center gap-1">
              {allowPrivateHttp ? <ShieldAlert size={10} /> : <ShieldCheck size={10} />}
              {allowPrivateHttp ? "private allowed" : "SSRF guard ON"}
            </span>
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel title="Request" subtitle="Hanya GET dan HEAD. Tidak ada injeksi payload otomatis.">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                <Field label="Method">
                  <select className="ctf-select" value={method} onChange={(event) => setMethod(event.target.value as "GET" | "HEAD")}>
                    <option value="GET">GET</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </Field>
                <Field label="URL">
                  <input
                    className="ctf-input ctf-mono"
                    placeholder="https://example.com/"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") inspect();
                    }}
                  />
                </Field>
              </div>
              <Field label="Header tambahan" hint="Satu header per baris, format Name: value.">
                <textarea
                  className="ctf-textarea min-h-[70px]"
                  placeholder={"User-Agent: CTF-Intelligence\nAccept: text/html"}
                  value={headerText}
                  onChange={(event) => setHeaderText(event.target.value)}
                />
              </Field>
              <button type="button" className="ctf-btn ctf-btn-primary" onClick={inspect} disabled={busy || !url.trim()}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Globe2 size={13} />}
                {busy ? "Mengambil…" : "Inspeksi"}
              </button>
              <ErrorBanner message={error} />
            </div>
          </Panel>

          {inspection && (
            <Panel
              title={`${inspection.method} ${inspection.status} ${inspection.statusText}`}
              subtitle={`${inspection.finalUrl} · ${formatBytes(inspection.bodyBytes)} · ${inspection.durationMs} ms${inspection.remoteAddress ? ` · ${inspection.remoteAddress}` : ""}`}
              actions={<CopyButton value={inspection.bodyPreview} label="Copy body" />}
            >
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Badge tone={inspection.status < 400 ? "green" : inspection.status < 500 ? "amber" : "rose"}>
                  HTTP {inspection.status}
                </Badge>
                {inspection.redirects.length > 0 && <Badge tone="cyan">{inspection.redirects.length} redirect</Badge>}
                {inspection.tls?.authorized === false && <Badge tone="rose">TLS tidak terverifikasi</Badge>}
                {inspection.bodyTruncated && <Badge tone="amber">body dipotong</Badge>}
              </div>

              <div className="mb-3 flex gap-1">
                {(["headers", "body", "tls"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="ctf-tab"
                    data-active={tab === item}
                    onClick={() => setTab(item)}
                  >
                    {item === "headers" ? `Headers (${Object.keys(inspection.headers).length})` : item === "body" ? "Body" : "TLS"}
                  </button>
                ))}
              </div>

              {tab === "headers" && (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-lg border border-[var(--ctf-line)]">
                    <table className="w-full text-left text-[11px]">
                      <tbody>
                        {Object.entries(inspection.headers).map(([key, value]) => (
                          <tr key={key} className="border-b border-[var(--ctf-line)] last:border-0">
                            <td className="ctf-mono w-[180px] align-top p-2 text-[#a5f3fc]">{key}</td>
                            <td className="break-all p-2 text-[var(--ctf-muted)]">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {missing.length > 0 && (
                    <div className="rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(69,45,5,0.15)] p-2.5">
                      <div className="ctf-label mb-1 text-[#fcd34d]">Header keamanan tidak ditemukan</div>
                      <div className="flex flex-wrap gap-1">
                        {missing.map((header) => <Badge key={header} tone="amber">{header}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "body" && (
                <pre className="ctf-code ctf-scroll max-h-[520px] whitespace-pre-wrap break-all">{inspection.bodyPreview}</pre>
              )}

              {tab === "tls" && (
                <div className="space-y-1.5 text-[11px]">
                  {inspection.tls ? (
                    Object.entries(inspection.tls).map(([key, value]) => (
                      <div key={key} className="flex flex-col gap-0.5 border-b border-[var(--ctf-line)] py-1.5 sm:flex-row sm:justify-between sm:gap-3">
                        <span className="ctf-label shrink-0">{key}</span>
                        <span className="min-w-0 break-all text-right text-[var(--ctf-muted)]">{String(value ?? "—")}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[var(--ctf-muted)]">Target bukan HTTPS atau tidak ada data sertifikat.</p>
                  )}
                </div>
              )}

              {inspection.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-[10px] text-[#fde68a]">
                  {inspection.warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Cakupan" subtitle="Apa yang benar-benar dilakukan.">
            <ul className="space-y-2 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
              <li>• Request langsung dari server Node, bukan proxy browser.</li>
              <li>• DNS di-resolve lalu diverifikasi terhadap rentang privat.</li>
              <li>• Redirect diikuti maksimal 4 kali dengan validasi ulang.</li>
              <li>• Body dibatasi 1.5 MB; binary ditampilkan sebagai hex.</li>
              <li>• Tidak ada modifikasi request otomatis atau fuzzing.</li>
            </ul>
          </Panel>
          <Panel title="Celah yang umum" noPadding>
            <div className="space-y-2 p-4 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
              <p className={cn("font-medium", "text-[#a7f3d0]")}>Cek manual:</p>
              <p>• Cookie tanpa HttpOnly/Secure/SameSite.</p>
              <p>• CORS wildcard dengan kredensial.</p>
              <p>• Direktori backup atau .git terekspos.</p>
              <p>• Redirect terbuka ke domain eksternal.</p>
              <p>• Teknologi server dari header versi.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
