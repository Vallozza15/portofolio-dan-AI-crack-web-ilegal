"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Binary,
  Bot,
  ChevronLeft,
  Crosshair,
  FileSearch,
  FileText,
  FolderKanban,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/ctf/format";

const NAV = [
  {
    section: "OPERATIONS",
    items: [
      { href: "/ctf", label: "Dashboard", icon: LayoutDashboard },
      { href: "/ctf/solver", label: "AI CTF Solver", icon: Sparkles, badge: "AI" },
      { href: "/ctf/research", label: "Answer Discovery", icon: Search, badge: "WEB" },
      { href: "/ctf/workspace", label: "Challenge Workspace", icon: FolderKanban },
    ],
  },
  {
    section: "LABS",
    items: [
      { href: "/ctf/crypto", label: "Cryptography", icon: KeyRound },
      { href: "/ctf/forensics", label: "Forensics", icon: FileSearch },
      { href: "/ctf/stego", label: "Steganography", icon: ImageIcon },
      { href: "/ctf/web", label: "Web Security", icon: Globe2 },
      { href: "/ctf/reverse", label: "Reverse Engineering", icon: Binary },
      { href: "/ctf/binary", label: "Binary Analysis", icon: Terminal },
      { href: "/ctf/osint", label: "OSINT", icon: Radar },
    ],
  },
  {
    section: "PLATFORM",
    items: [
      { href: "/ctf/platforms", label: "Platform Discovery", icon: Crosshair },
      { href: "/ctf/tools", label: "Integrated Tools", icon: Wrench },
      { href: "/ctf/reports", label: "Reports", icon: FileText },
      { href: "/ctf/settings/ai", label: "AI Settings", icon: Bot },
      { href: "/ctf/settings/system", label: "System Settings", icon: Settings2 },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/ctf") return pathname === "/ctf";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CtfShell({
  children,
  authEnabled,
  providerLabel,
  providerConfigured,
  sandboxEnabled,
  hostToolsEnabled,
}: {
  children: ReactNode;
  authEnabled: boolean;
  providerLabel: string;
  providerConfigured: boolean;
  sandboxEnabled: boolean;
  hostToolsEnabled: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/ctf/auth/login", { method: "DELETE" });
    } finally {
      router.push("/ctf/login");
      router.refresh();
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[rgba(52,211,153,0.35)] bg-[rgba(6,78,59,0.35)] text-[var(--ctf-green)]">
          <Crosshair size={20} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--ctf-cyan)] shadow-[0_0_8px_var(--ctf-cyan)]" />
        </div>
        <div className="min-w-0">
          <div className="ctf-mono text-[13px] font-semibold tracking-[0.14em] text-white">CTF INTELLIGENCE</div>
          <div className="ctf-label mt-1 text-[8.5px] tracking-[0.2em]">AI CYBERSECURITY SOLVER</div>
        </div>
      </div>

      <div className="mx-4 mb-3 rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.45)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="ctf-label text-[8.5px]">AI ENGINE</span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[9.5px]",
              providerConfigured ? "text-[#6ee7b7]" : "text-[#fcd34d]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                providerConfigured ? "bg-[var(--ctf-green)]" : "bg-[var(--ctf-amber)]",
              )}
            />
            {providerLabel}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-[var(--ctf-dim)]">
          <ShieldCheck size={11} />
          Local-first · evidence based
        </div>
      </div>

      <nav className="ctf-scroll flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.section} className="mb-4">
            <div className="ctf-label px-2 pb-1.5 text-[8.5px] tracking-[0.2em]">{group.section}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className="ctf-nav-item" data-active={active} onClick={() => setOpen(false)}>
                    <Icon size={15} className="shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {"badge" in item && item.badge && (
                      <span className="rounded border border-[rgba(52,211,153,0.3)] px-1 py-0.5 text-[8px] text-[#6ee7b7]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--ctf-line)] p-3">
        <div className="mb-2 grid grid-cols-2 gap-1.5 text-[9px]">
          <div className={cn("rounded border px-2 py-1.5", hostToolsEnabled ? "border-[rgba(251,191,36,0.3)] text-[#fcd34d]" : "border-[var(--ctf-line)] text-[var(--ctf-dim)]")}>
            HOST {hostToolsEnabled ? "ON" : "OFF"}
          </div>
          <div className={cn("rounded border px-2 py-1.5", sandboxEnabled ? "border-[rgba(52,211,153,0.3)] text-[#6ee7b7]" : "border-[var(--ctf-line)] text-[var(--ctf-dim)]")}>
            SANDBOX {sandboxEnabled ? "ON" : "OFF"}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-1">
          <Link href="/" className="flex items-center gap-1.5 text-[10px] text-[var(--ctf-dim)] hover:text-[var(--ctf-text)]">
            <ChevronLeft size={12} /> Portfolio
          </Link>
          {authEnabled ? (
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="flex items-center gap-1.5 text-[10px] text-[var(--ctf-dim)] hover:text-[#fecdd3]"
            >
              <LogOut size={12} /> {loggingOut ? "Keluar…" : "Logout"}
            </button>
          ) : (
            <span className="text-[9px] text-[var(--ctf-dim)]">v1.0 · local</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-[var(--ctf-line)] bg-[rgba(2,7,13,0.72)] backdrop-blur lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-[272px] border-r border-[var(--ctf-line)] bg-[#02070d]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 z-10 rounded p-1 text-[var(--ctf-muted)] hover:text-white"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--ctf-line)] bg-[rgba(4,11,19,0.82)] px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-[var(--ctf-line)] p-1.5 text-[var(--ctf-muted)] hover:text-white lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Buka menu"
            >
              <Menu size={16} />
            </button>
            <div className="min-w-0">
              <div className="ctf-mono truncate text-[10.5px] tracking-[0.12em] text-[#a7f3d0]">
                ANALYZE · INVESTIGATE · EXPLOIT THE PUZZLE
              </div>
              <div className="ctf-label truncate text-[8px] tracking-[0.18em]">CAPTURE THE FLAG</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--ctf-line)] px-2.5 py-1 text-[9px] text-[var(--ctf-muted)] sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ctf-green)]" />
              AUTHORIZED LAB
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--ctf-line)] px-2.5 py-1 text-[9px] text-[var(--ctf-muted)] md:inline-flex">
              <Terminal size={11} /> {providerLabel}
            </span>
          </div>
        </header>
        <main className="relative min-h-[calc(100vh-3.5rem)] px-4 py-5 sm:px-6 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
