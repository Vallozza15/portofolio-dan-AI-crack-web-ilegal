"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { CTF_TRANSITION_MS, CtfTransitionOverlay } from "@/components/ctf/transition-overlay";
import { ctfShortcutUrl } from "@/lib/site";

/** Tombol bulat di kanan bawah halaman CV untuk pindah ke halaman login web AI CTF. */
export function CtfShortcut() {
  // Same-origin by default so the button works in the single-server setup
  // (portfolio and /ctf in one app). Set NEXT_PUBLIC_CTF_URL for a split host.
  const href = ctfShortcutUrl;
  const [leaving, setLeaving] = useState(false);

  const go = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => window.location.assign(href), CTF_TRANSITION_MS);
  };

  return (
    <>
      <a
        href={href}
        onClick={go}
        aria-label="Buka AI CTF Solver"
        title="Buka AI CTF Solver"
        className="group fixed bottom-6 right-6 z-50 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-[var(--accent)] text-white shadow-[0_12px_32px_rgba(139,92,246,0.4)] transition-transform duration-300 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] md:bottom-8 md:right-8"
      >
        <Bot className="h-5 w-5" strokeWidth={1.8} />
        <span className="pointer-events-none absolute right-14 hidden whitespace-nowrap rounded-full border border-line-strong bg-[var(--glass)] px-3 py-1.5 text-xs font-medium text-ink opacity-0 shadow-xl backdrop-blur-xl transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
          Buka AI CTF
        </span>
      </a>
      <CtfTransitionOverlay open={leaving} label="Menghubungkan ke CTF Intelligence" />
    </>
  );
}
