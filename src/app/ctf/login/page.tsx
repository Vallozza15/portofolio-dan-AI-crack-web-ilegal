"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { CTF_TRANSITION_MS, CtfTransitionOverlay } from "@/components/ctf/transition-overlay";

export default function CtfLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entering, setEntering] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ctf/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Login gagal.");
      // Logo membesar dulu, lalu halaman /ctf dibuka.
      setEntering(true);
      await new Promise((resolve) => setTimeout(resolve, CTF_TRANSITION_MS));
      router.push("/ctf");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  return (
    <div className="ctf flex min-h-screen items-center justify-center px-4">
      <div className="ctf-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(52,211,153,0.35)] bg-[rgba(6,78,59,0.35)] text-[var(--ctf-green)]">
            <Crosshair size={22} />
          </div>
          <div>
            <div className="ctf-mono text-[14px] font-semibold tracking-[0.14em] text-white">CTF INTELLIGENCE</div>
            <div className="ctf-label mt-1 text-[8.5px] tracking-[0.2em]">AI CYBERSECURITY SOLVER</div>
          </div>
        </div>

        <form onSubmit={submit} className="ctf-panel p-5">
          <div className="mb-4 flex items-center gap-2 text-[#a7f3d0]">
            <KeyRound size={15} />
            <h1 className="text-[14px] font-semibold">Akses terbatas</h1>
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-[var(--ctf-muted)]">
            Platform ini dilindungi <span className="ctf-mono text-[#a7f3d0]">CTF_ACCESS_PASSWORD</span>.
            Masukkan password untuk membuka laboratorium.
          </p>
          <label className="block">
            <span className="ctf-label mb-1.5 block">Access password</span>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ctf-dim)]" />
              <input
                className="ctf-input pl-9"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
              />
            </div>
          </label>
          {error && <p className="mt-2 text-[11px] text-[#fda4af]">{error}</p>}
          <button type="submit" className="ctf-btn ctf-btn-primary mt-3 w-full" disabled={busy || !password}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
            {busy ? "Memverifikasi…" : "Buka CTF Intelligence"}
          </button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[9.5px] text-[var(--ctf-dim)]">
            <ShieldCheck size={11} /> Sesi HMAC 12 jam · cookie httpOnly · rate limited
          </p>
        </form>
      </div>
      <CtfTransitionOverlay
        open={entering}
        variant="enter"
        label="Membuka laboratorium CTF"
      />
    </div>
  );
}
