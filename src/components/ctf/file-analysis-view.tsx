"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  Binary,
  FileCode2,
  Fingerprint,
  Image as ImageIcon,
  Network,
  ScanSearch,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Badge, CopyButton, EmptyState, InfoRow, TabBar } from "./ui";
import { CATEGORY_LABELS, formatBytes, formatDateTime, cn } from "@/lib/ctf/format";
import type { FileAnalysis } from "@/lib/ctf/types";

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const classes = cols === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : cols === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2";
  return <div className={cn("grid gap-3", classes)}>{children}</div>;
}

function MiniCard({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
      <div className="ctf-label text-[8.5px]">{label}</div>
      <div className={cn("mt-1.5 break-words text-[12px] text-[#d1fae5]", mono && "ctf-mono text-[11px]")}>{value || "—"}</div>
    </div>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--ctf-line)] py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="ctf-label shrink-0">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="ctf-mono truncate text-[10.5px] text-[#a7f3d0]">{value}</code>
        <CopyButton value={value} label="" />
      </div>
    </div>
  );
}

export function FileAnalysisView({ analysis }: { analysis: FileAnalysis }) {
  const [tab, setTab] = useState("overview");
  const [stringQuery, setStringQuery] = useState("");
  const filteredStrings = useMemo(() => {
    const query = stringQuery.trim().toLowerCase();
    const values = query ? analysis.strings.filter((value) => value.toLowerCase().includes(query)) : analysis.strings;
    return values.slice(0, 400);
  }, [analysis.strings, stringQuery]);

  const tabs = [
    { id: "overview", label: "Ringkasan" },
    { id: "strings", label: "Strings", count: analysis.stringCount },
    { id: "hex", label: "Hex" },
    { id: "stego", label: "Stego & Flag", count: analysis.stego.length + analysis.flagCandidates.length },
    { id: "structure", label: "Struktur" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="cyan">{analysis.magic}</Badge>
          <Badge>{formatBytes(analysis.size)}</Badge>
          <Badge tone={analysis.entropy > 7.4 ? "rose" : analysis.entropy > 6 ? "amber" : "green"}>
            entropy {analysis.entropy}
          </Badge>
          {analysis.categoryHints.slice(0, 4).map((category) => (
            <Badge key={category} tone="violet">{CATEGORY_LABELS[category]}</Badge>
          ))}
        </div>
        <span className="text-[10px] text-[var(--ctf-dim)]">dianalisis {formatDateTime(analysis.analyzedAt)} · {analysis.durationMs} ms</span>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-4">
          <Grid cols={4}>
            <MiniCard label="Nama file" value={analysis.name} />
            <MiniCard label="Ukuran" value={formatBytes(analysis.size)} />
            <MiniCard label="MIME" value={analysis.mime} mono />
            <MiniCard label="Magic" value={analysis.magic} />
          </Grid>
          <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Fingerprint size={14} className="text-[var(--ctf-green)]" />
              <span className="ctf-label">Hashes</span>
            </div>
            <HashRow label="SHA-256" value={analysis.sha256} />
            <HashRow label="MD5" value={analysis.md5} />
            <HashRow label="SHA-1" value={analysis.sha1} />
          </div>
          {analysis.warnings.length > 0 && (
            <div className="rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(69,45,5,0.18)] p-3">
              <div className="mb-1.5 flex items-center gap-2 text-[#fcd34d]">
                <ShieldAlert size={14} />
                <span className="ctf-label text-[#fcd34d]">Peringatan</span>
              </div>
              <ul className="space-y-1 text-[11px] leading-relaxed text-[#fde68a]">
                {analysis.warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
              </ul>
            </div>
          )}
          {analysis.qr && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="ctf-label mb-1">QR decoder</div>
              <p className="text-[11.5px] text-[#d1fae5]">{analysis.qr.note}</p>
              {analysis.qr.data && <div className="ctf-flag mt-2 break-all">{analysis.qr.data}</div>}
            </div>
          )}
          {analysis.tags && Object.keys(analysis.tags).length > 0 && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="ctf-label mb-2">Tag metadata</div>
              <Grid cols={2}>
                {Object.entries(analysis.tags).map(([key, value]) => (
                  <MiniCard key={key} label={key} value={value} mono />
                ))}
              </Grid>
            </div>
          )}
          {analysis.encodingLayers && analysis.encodingLayers.length > 0 && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--ctf-cyan)]" />
                <span className="ctf-label">Encoding layers</span>
              </div>
              <div className="space-y-2">
                {analysis.encodingLayers.map((layer, index) => (
                  <div key={index}>
                    <div className="text-[10.5px] text-[var(--ctf-muted)]">{layer.operation}</div>
                    <pre className="ctf-code mt-1 max-h-32 whitespace-pre-wrap break-all">{layer.value.slice(0, 2000)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "strings" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              className="ctf-input max-w-sm"
              placeholder="Cari string…"
              value={stringQuery}
              onChange={(event) => setStringQuery(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--ctf-dim)]">
                {filteredStrings.length} dari {analysis.stringCount}
              </span>
              <CopyButton value={analysis.strings.join("\n")} label="Copy semua" />
            </div>
          </div>
          {filteredStrings.length ? (
            <pre className="ctf-code ctf-scroll max-h-[520px] whitespace-pre-wrap break-all">{filteredStrings.join("\n")}</pre>
          ) : (
            <EmptyState title="Tidak ada string yang cocok" description="Coba kata kunci lain atau lihat hex untuk data biner." />
          )}
        </div>
      )}

      {tab === "hex" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="ctf-label">Hex preview · maks 1024 byte pertama</span>
            <CopyButton value={analysis.hexPreview} label="Copy hex" />
          </div>
          <pre className="ctf-code ctf-scroll ctf-hex max-h-[520px]">{analysis.hexPreview}</pre>
        </div>
      )}

      {tab === "stego" && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <ScanSearch size={14} className="text-[var(--ctf-green)]" />
              <span className="ctf-label">Kandidat flag</span>
            </div>
            {analysis.flagCandidates.length ? (
              <div className="space-y-2">
                {analysis.flagCandidates.map((candidate) => (
                  <div key={candidate.value} className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <code className="ctf-flag break-all">{candidate.value}</code>
                      <Badge tone={candidate.confidence >= 0.8 ? "green" : candidate.confidence >= 0.5 ? "amber" : "rose"}>
                        confidence {candidate.confidence}
                      </Badge>
                    </div>
                    <div className="mt-2 text-[10.5px] text-[var(--ctf-muted)]">{candidate.source}</div>
                    {candidate.context && <div className="mt-1 text-[10.5px] text-[var(--ctf-dim)]">{candidate.context}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Belum ada kandidat flag" description="Parser tidak menemukan pola flag pada file ini. Ini bukan bukti challenge tidak punya solusi." />
            )}
          </div>
          {analysis.stego.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon size={14} className="text-[var(--ctf-cyan)]" />
                <span className="ctf-label">Temuan stego / metadata</span>
              </div>
              <div className="space-y-2">
                {analysis.stego.map((finding, index) => (
                  <div key={index} className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-[#d1fae5]">{finding.technique}</span>
                      <Badge tone={finding.confidence === "high" ? "green" : finding.confidence === "medium" ? "amber" : "rose"}>
                        {finding.confidence}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ctf-muted)]">{finding.detail}</p>
                    {finding.output && <pre className="ctf-code mt-2 max-h-48 whitespace-pre-wrap break-all">{finding.output}</pre>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.embedded.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Archive size={14} className="text-[var(--ctf-violet)]" />
                <span className="ctf-label">Embedded files</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--ctf-line)]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[rgba(14,33,51,0.7)] text-[var(--ctf-muted)]">
                    <tr><th className="p-2">Offset</th><th className="p-2">Signature</th><th className="p-2">Tipe</th><th className="p-2">Ekstensi</th></tr>
                  </thead>
                  <tbody>
                    {analysis.embedded.map((item, index) => (
                      <tr key={index} className="border-t border-[var(--ctf-line)]">
                        <td className="ctf-mono p-2">0x{item.offset.toString(16)}</td>
                        <td className="p-2">{item.signature}</td>
                        <td className="p-2">{item.label}</td>
                        <td className="ctf-mono p-2">.{item.probableExtension}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "structure" && (
        <div className="space-y-4">
          {!analysis.archive && !analysis.image && !analysis.audio && !analysis.executable && !analysis.pcap && !analysis.pdf && (
            <EmptyState title="Tidak ada struktur format khusus" description="Parser mendeteksi file sebagai data umum. Gunakan strings, hex, dan stego untuk eksplorasi." />
          )}
          {analysis.image && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2"><ImageIcon size={14} className="text-[var(--ctf-green)]" /><span className="ctf-label">Image</span></div>
              <Grid cols={4}>
                <MiniCard label="Format" value={analysis.image.format} />
                <MiniCard label="Dimensi" value={`${analysis.image.width || "?"} × ${analysis.image.height || "?"}`} />
                <MiniCard label="Bit depth" value={analysis.image.bitDepth || "—"} />
                <MiniCard label="Frames" value={analysis.image.frames || "—"} />
              </Grid>
              {analysis.image.exif && Object.keys(analysis.image.exif).length > 0 && (
                <div className="mt-3">
                  <div className="ctf-label mb-1">EXIF</div>
                  <div className="max-h-48 overflow-auto rounded border border-[var(--ctf-line)] p-2">
                    {Object.entries(analysis.image.exif).map(([key, value]) => <InfoRow key={key} label={key}>{value}</InfoRow>)}
                  </div>
                </div>
              )}
              {analysis.image.chunks && analysis.image.chunks.length > 0 && (
                <div className="mt-3">
                  <div className="ctf-label mb-1">Chunks</div>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.image.chunks.map((chunk, index) => <Badge key={index} tone="cyan">{chunk.type} · {chunk.length} B</Badge>)}
                  </div>
                </div>
              )}
            </div>
          )}
          {analysis.audio && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2"><FileCode2 size={14} className="text-[var(--ctf-cyan)]" /><span className="ctf-label">Audio</span></div>
              <Grid cols={4}>
                <MiniCard label="Format" value={analysis.audio.format} />
                <MiniCard label="Sample rate" value={analysis.audio.sampleRate ? `${analysis.audio.sampleRate} Hz` : "—"} />
                <MiniCard label="Channels" value={analysis.audio.channels || "—"} />
                <MiniCard label="Duration" value={analysis.audio.durationSeconds ? `${analysis.audio.durationSeconds.toFixed(2)} s` : "—"} />
              </Grid>
              {analysis.audio.trailingBytes ? <p className="mt-2 text-[11px] text-[#fde68a]">{analysis.audio.trailingBytes} byte setelah akhir audio.</p> : null}
            </div>
          )}
          {analysis.pdf && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2"><FileCode2 size={14} className="text-[var(--ctf-violet)]" /><span className="ctf-label">PDF</span></div>
              <Grid cols={4}>
                <MiniCard label="Versi" value={analysis.pdf.version} />
                <MiniCard label="Halaman" value={analysis.pdf.pages} />
                <MiniCard label="Objects" value={analysis.pdf.objects} />
                <MiniCard label="JavaScript" value={analysis.pdf.hasJavaScript ? "YA" : "tidak"} />
              </Grid>
              <div className="mt-2 flex flex-wrap gap-2">
                {analysis.pdf.hasEmbeddedFiles && <Badge tone="amber">embedded files</Badge>}
                {analysis.pdf.hasOpenAction && <Badge tone="rose">open action</Badge>}
                {analysis.pdf.producer && <Badge>producer: {analysis.pdf.producer}</Badge>}
                {analysis.pdf.creator && <Badge>creator: {analysis.pdf.creator}</Badge>}
              </div>
            </div>
          )}
          {analysis.archive && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2"><Archive size={14} className="text-[var(--ctf-amber)]" /><span className="ctf-label">Archive · {analysis.archive.format}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[rgba(14,33,51,0.7)] text-[var(--ctf-muted)]"><tr><th className="p-2">Entry</th><th className="p-2">Compressed</th><th className="p-2">Size</th><th className="p-2">Method</th><th className="p-2">Enc</th></tr></thead>
                  <tbody>
                    {analysis.archive.entries.slice(0, 100).map((entry, index) => (
                      <tr key={index} className="border-t border-[var(--ctf-line)]">
                        <td className="ctf-mono max-w-[280px] truncate p-2">{entry.name}</td>
                        <td className="p-2">{formatBytes(entry.compressedSize)}</td>
                        <td className="p-2">{formatBytes(entry.uncompressedSize)}</td>
                        <td className="p-2">{entry.compression}</td>
                        <td className="p-2">{entry.encrypted ? "ya" : "tidak"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analysis.archive.truncated && <p className="mt-2 text-[10.5px] text-[var(--ctf-dim)]">Daftar entry dipotong.</p>}
            </div>
          )}
          {analysis.executable && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2"><Binary size={14} className="text-[var(--ctf-rose)]" /><span className="ctf-label">Executable · {analysis.executable.format}</span></div>
              <Grid cols={4}>
                <MiniCard label="Arsitektur" value={`${analysis.executable.architecture} ${analysis.executable.bits}-bit`} />
                <MiniCard label="Entry point" value={analysis.executable.entryPoint || "—"} mono />
                <MiniCard label="Image base" value={analysis.executable.imageBase || "—"} mono />
                <MiniCard label="Tipe" value={analysis.executable.type || "—"} />
              </Grid>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {analysis.executable.security.map((feature) => (
                  <Badge key={feature.name} tone={feature.enabled === null ? "amber" : feature.enabled ? "green" : "rose"}>
                    {feature.name}: {feature.enabled === null ? "?" : feature.enabled ? "ON" : "OFF"}
                  </Badge>
                ))}
              </div>
              {analysis.executable.packingHints.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-[#fde68a]">
                  {analysis.executable.packingHints.map((hint, index) => <li key={index}>• {hint}</li>)}
                </ul>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[rgba(14,33,51,0.7)] text-[var(--ctf-muted)]"><tr><th className="p-2">Section</th><th className="p-2">VAddr</th><th className="p-2">Raw</th><th className="p-2">Entropy</th></tr></thead>
                  <tbody>
                    {analysis.executable.sections.slice(0, 40).map((section) => (
                      <tr key={section.name} className="border-t border-[var(--ctf-line)]">
                        <td className="ctf-mono p-2">{section.name}</td>
                        <td className="p-2">{section.virtualAddress}</td>
                        <td className="p-2">{formatBytes(section.rawSize)}</td>
                        <td className={cn("p-2", section.entropy > 7.2 ? "text-[#fda4af]" : "text-[#a7f3d0]")}>{section.entropy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analysis.executable.imports.length > 0 && (
                <div className="mt-3">
                  <div className="ctf-label mb-1">Imports</div>
                  <div className="space-y-1">
                    {analysis.executable.imports.slice(0, 12).map((item) => (
                      <div key={item.library} className="text-[10.5px] text-[var(--ctf-muted)]">
                        <span className="ctf-mono text-[#a5f3fc]">{item.library}</span>: {item.functions.slice(0, 16).join(", ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {analysis.pcap && (
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-2 flex items-center gap-2"><Network size={14} className="text-[var(--ctf-cyan)]" /><span className="ctf-label">PCAP</span></div>
              <Grid cols={4}>
                <MiniCard label="Format" value={analysis.pcap.format} />
                <MiniCard label="Paket" value={analysis.pcap.packetCount} />
                <MiniCard label="Bytes" value={formatBytes(analysis.pcap.capturedBytes)} />
                <MiniCard label="Link type" value={analysis.pcap.linkType} />
              </Grid>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(analysis.pcap.protocols).map(([protocol, count]) => <Badge key={protocol} tone="cyan">{protocol}: {count}</Badge>)}
              </div>
              {analysis.pcap.dnsQueries.length > 0 && (
                <div className="mt-2"><span className="ctf-label">DNS:</span> <span className="ctf-mono text-[10.5px] text-[#a7f3d0]">{analysis.pcap.dnsQueries.slice(0, 30).join(", ")}</span></div>
              )}
              {analysis.pcap.httpHosts.length > 0 && (
                <div className="mt-1"><span className="ctf-label">HTTP hosts:</span> <span className="ctf-mono text-[10.5px] text-[#a7f3d0]">{analysis.pcap.httpHosts.slice(0, 20).join(", ")}</span></div>
              )}
              {analysis.pcap.credentials.length > 0 && (
                <div className="mt-2 rounded border border-[rgba(251,113,133,0.3)] bg-[rgba(76,5,25,0.2)] p-2">
                  <span className="ctf-label text-[#fda4af]">Potensi kredensial</span>
                  <pre className="ctf-code mt-1 max-h-32 whitespace-pre-wrap">{analysis.pcap.credentials.join("\n")}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
