import Link from "next/link";
import {
  Activity,
  Bot,
  Boxes,
  Cpu,
  Crosshair,
  FileSearch,
  Flag,
  FolderKanban,
  Gauge,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { Badge, EmptyState, Panel, StatCard, StatusBadge } from "@/components/ctf/ui";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getDashboardData } from "@/lib/ctf/dashboard";
import {
  CATEGORY_LABELS,
  CATEGORY_TONES,
  DIFFICULTY_LABELS,
  formatBytes,
  relativeTime,
} from "@/lib/ctf/format";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<string, string> = {
  green: "border-[rgba(52,211,153,0.3)] text-[#6ee7b7]",
  cyan: "border-[rgba(34,211,238,0.3)] text-[#67e8f9]",
  amber: "border-[rgba(251,191,36,0.3)] text-[#fcd34d]",
  rose: "border-[rgba(251,113,133,0.3)] text-[#fda4af]",
  violet: "border-[rgba(167,139,250,0.3)] text-[#c4b5fd]",
};

export default async function DashboardPage() {
  await requirePageAuth();
  const data = await getDashboardData();
  const installedTools = data.toolStatus.filter((tool) => tool.installed).length;
  const configuredProviders = data.providerStatus.filter((provider) => provider.configured).length;
  const maxCategory = Math.max(1, ...data.categories.map((item) => item.count));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="ctf-label mb-2 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ctf-green)] shadow-[0_0_8px_var(--ctf-green)]" />
            SECURITY OPERATIONS CENTER
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[30px]">
            CTF Intelligence
          </h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-[var(--ctf-muted)]">
            Analyze. Investigate. Exploit the Puzzle. Capture the Flag. Semua analisis berbasis bukti lokal;
            flag hanya ditandai VERIFIED jika benar-benar cocok.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/ctf/solver" className="ctf-btn ctf-btn-primary">
            <Sparkles size={14} /> Mulai Investigasi
          </Link>
          <Link href="/ctf/workspace" className="ctf-btn">
            <FolderKanban size={14} /> Workspace
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Challenge dianalisis"
          value={data.totals.challenges}
          detail={`${data.totals.files} file · ${data.totals.evidence} bukti`}
          icon={<FolderKanban size={14} />}
          tone="cyan"
        />
        <StatCard
          label="Terverifikasi"
          value={data.totals.solved}
          detail={`${data.totals.flags} kandidat flag tercatat`}
          icon={<Flag size={14} />}
          tone="green"
        />
        <StatCard
          label="Sesi AI"
          value={data.totals.sessions}
          detail={`${configuredProviders} provider siap`}
          icon={<Bot size={14} />}
          tone="violet"
        />
        <StatCard
          label="Tool terpasang"
          value={`${installedTools}/${data.toolStatus.length}`}
          detail={data.system.sandboxEnabled ? "Sandbox aktif" : "Sandbox nonaktif"}
          icon={<Wrench size={14} />}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Distribusi kategori"
          subtitle="Challenge tersimpan per disiplin CTF."
        >
          <div className="space-y-2.5">
            {data.categories.map((item) => (
              <div key={item.category}>
                <div className="mb-1 flex items-center justify-between text-[10.5px]">
                  <span className="text-[var(--ctf-muted)]">{CATEGORY_LABELS[item.category]}</span>
                  <span className="ctf-mono text-[#a7f3d0]">{item.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(8,19,31,0.9)]">
                  <div
                    className={`h-full rounded-full ${
                      CATEGORY_TONES[item.category] === "rose"
                        ? "bg-[#fb7185]"
                        : CATEGORY_TONES[item.category] === "amber"
                          ? "bg-[#fbbf24]"
                          : CATEGORY_TONES[item.category] === "violet"
                            ? "bg-[#a78bfa]"
                            : CATEGORY_TONES[item.category] === "cyan"
                              ? "bg-[#22d3ee]"
                              : "bg-[#34d399]"
                    }`}
                    style={{ width: `${Math.max(2, (item.count / maxCategory) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--ctf-line)] pt-3 text-[10px] sm:grid-cols-4">
            <div className="flex items-center gap-1.5 text-[var(--ctf-muted)]"><Activity size={11} /> {data.totals.sessions} sesi</div>
            <div className="flex items-center gap-1.5 text-[var(--ctf-muted)]"><FileSearch size={11} /> {data.totals.files} file</div>
            <div className="flex items-center gap-1.5 text-[var(--ctf-muted)]"><Gauge size={11} /> {formatBytes(data.storage.bytes)}</div>
            <div className="flex items-center gap-1.5 text-[var(--ctf-muted)]"><Cpu size={11} /> {data.system.runtime}</div>
          </div>
        </Panel>

        <Panel title="Status sistem" subtitle="Provider AI, tool, dan kontrol keamanan.">
          <div className="space-y-1.5">
            {data.providerStatus.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#d1fae5]">{provider.label}</div>
                  <div className="truncate text-[9.5px] text-[var(--ctf-dim)]">{provider.model}</div>
                </div>
                <Badge tone={provider.configured ? "green" : "rose"}>
                  {provider.configured ? (provider.source === "env" ? "ENV" : "READY") : "OFF"}
                </Badge>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[var(--ctf-line)] px-2.5 py-2">
              <div className="ctf-label text-[8px]">Host tools</div>
              <div className={`mt-1 text-[11px] ${data.system.hostToolsEnabled ? "text-[#fcd34d]" : "text-[var(--ctf-dim)]"}`}>
                {data.system.hostToolsEnabled ? "Diaktifkan" : "Dinonaktifkan"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--ctf-line)] px-2.5 py-2">
              <div className="ctf-label text-[8px]">Docker sandbox</div>
              <div className={`mt-1 text-[11px] ${data.system.sandboxEnabled ? "text-[#6ee7b7]" : "text-[var(--ctf-dim)]"}`}>
                {data.system.sandboxEnabled ? "Diaktifkan" : "Dinonaktifkan"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--ctf-line)] px-2.5 py-2">
              <div className="ctf-label text-[8px]">Autentikasi</div>
              <div className={`mt-1 text-[11px] ${data.system.authEnabled ? "text-[#6ee7b7]" : "text-[#fcd34d]"}`}>
                {data.system.authEnabled ? "Aktif" : "Terbuka"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--ctf-line)] px-2.5 py-2">
              <div className="ctf-label text-[8px]">Data dir</div>
              <div className="ctf-mono mt-1 truncate text-[9px] text-[var(--ctf-muted)]">{data.storage.dataDir}</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Challenge terbaru" subtitle="Lanjutkan investigasi." noPadding>
          {data.recentChallenges.length ? (
            <div className="divide-y divide-[var(--ctf-line)]">
              {data.recentChallenges.map((challenge) => (
                <Link
                  key={challenge.id}
                  href={`/ctf/workspace`}
                  className="block px-4 py-3 transition hover:bg-[rgba(14,33,51,0.45)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-[11.5px] font-medium text-[#e6f7f4]">{challenge.title}</span>
                    <StatusBadge status={challenge.status} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-[var(--ctf-dim)]">
                    <span className={`rounded border px-1.5 py-0.5 ${TONE_CLASSES[CATEGORY_TONES[challenge.category]]}`}>
                      {CATEGORY_LABELS[challenge.category]}
                    </span>
                    <span>{DIFFICULTY_LABELS[challenge.difficulty]}</span>
                    <span>· {relativeTime(challenge.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="Belum ada challenge"
                description="Buat challenge pertama di Workspace untuk mulai mengumpulkan bukti."
                action={<Link href="/ctf/workspace" className="ctf-btn ctf-btn-sm ctf-btn-primary">Buka Workspace</Link>}
              />
            </div>
          )}
        </Panel>

        <Panel title="Sesi terbaru" subtitle="Riwayat investigasi AI." noPadding>
          {data.recentSessions.length ? (
            <div className="divide-y divide-[var(--ctf-line)]">
              {data.recentSessions.map((session) => (
                <Link key={session.id} href="/ctf/solver" className="block px-4 py-3 transition hover:bg-[rgba(14,33,51,0.45)]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-[11.5px] text-[#e6f7f4]">{session.title}</span>
                    <StatusBadge status={session.status} />
                  </div>
                  <div className="mt-1 text-[9.5px] text-[var(--ctf-dim)]">
                    {session.messageCount} pesan · {relativeTime(session.updatedAt)}
                    {session.challengeTitle ? ` · ${session.challengeTitle}` : ""}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="Belum ada sesi" description="Mulai dari AI CTF Solver." action={<Link href="/ctf/solver" className="ctf-btn ctf-btn-sm">Buka Solver</Link>} />
            </div>
          )}
        </Panel>

        <Panel title="Flag & aktivitas" subtitle="Hanya kandidat nyata yang tercatat." noPadding>
          <div className="p-4">
            {data.recentFlags.length ? (
              <div className="mb-4 space-y-2">
                {data.recentFlags.map((flag) => (
                  <div key={flag.id} className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-2.5">
                    <div className="ctf-flag truncate text-[10.5px]">{flag.value}</div>
                    <div className="mt-1 flex items-center justify-between text-[9px] text-[var(--ctf-dim)]">
                      <span className="truncate">{flag.source}</span>
                      <StatusBadge status={flag.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-[10.5px] text-[var(--ctf-dim)]">Belum ada flag terdeteksi.</p>
            )}
            <div className="space-y-2 border-t border-[var(--ctf-line)] pt-3">
              {data.recentActivity.length ? (
                data.recentActivity.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_CLASSES[item.tone].split(" ")[0]}`} />
                    <div className="min-w-0">
                      <div className="ctf-mono text-[9.5px] text-[#a7f3d0]">{item.label}</div>
                      <div className="line-clamp-1 text-[9px] text-[var(--ctf-dim)]">{item.detail}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-[var(--ctf-dim)]">Aktivitas akan tercatat otomatis.</p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/ctf/crypto", label: "Cryptography Lab", icon: ShieldCheck, text: "Encoding, cipher klasik, XOR, AES/RSA edukasi." },
          { href: "/ctf/forensics", label: "Digital Forensics", icon: FileSearch, text: "Metadata, PCAP, arsip, strings, embedded file." },
          { href: "/ctf/tools", label: "Integrated Tools", icon: Terminal, text: "Status tool nyata, host runner, Docker sandbox." },
          { href: "/ctf/reports", label: "Reports", icon: Boxes, text: "Ekspor walkthrough Markdown dan PDF." },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="ctf-panel-flat ctf-panel-hover group p-4">
              <div className="flex items-center justify-between">
                <Icon size={16} className="text-[var(--ctf-green)]" />
                <Crosshair size={13} className="text-[var(--ctf-dim)] transition group-hover:text-[var(--ctf-cyan)]" />
              </div>
              <div className="mt-2 text-[12px] font-medium text-[#e6f7f4]">{item.label}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--ctf-muted)]">{item.text}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
