"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { GalleryManager } from "@/components/admin/gallery-manager";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthState =
  | { state: "checking" }
  | { state: "signed-out" }
  | { state: "signed-in"; session: Session };

export default function AdminPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [auth, setAuth] = useState<AuthState>(() => ({
    state: supabase ? "checking" : "signed-out",
  }));

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuth(data.session ? { state: "signed-in", session: data.session } : { state: "signed-out" });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuth(session ? { state: "signed-in", session } : { state: "signed-out" });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!supabase) {
    return <AdminSetup />;
  }

  if (auth.state === "checking") {
    return <AdminLoading />;
  }

  if (auth.state === "signed-out") {
    return <AdminLogin supabase={supabase} />;
  }

  return <AdminEntry supabase={supabase} session={auth.session} />;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative min-h-[85svh] overflow-hidden pb-20 pt-28 md:pt-32">
      <div aria-hidden className="hero-grid absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-0 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-[130px]"
      />
      <div className="container-page relative">{children}</div>
    </section>
  );
}

function AdminLoading() {
  return (
    <AdminShell>
      <div className="grid min-h-[50svh] place-items-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            Memeriksa sesi
          </p>
        </div>
      </div>
    </AdminShell>
  );
}

function AdminSetup() {
  const steps = [
    {
      icon: Database,
      title: "Buat proyek Supabase",
      body: "Jalankan supabase/schema.sql di editor SQL. Skrip ini membuat tabel galeri, fungsi peran admin, bucket penyimpanan, dan kebijakan keamanan tingkat baris.",
    },
    {
      icon: KeyRound,
      title: "Tambahkan variabel lingkungan publik",
      body: "Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local. Gunakan hanya anon key — jangan pernah membuka service-role key ke peramban.",
    },
    {
      icon: ShieldCheck,
      title: "Buat akun admin Anda",
      body: "Tambahkan pengguna di Supabase Authentication, lalu masukkan UUID pengguna itu ke public.admin_users. Nonaktifkan pendaftaran publik untuk studio satu pemilik.",
    },
    {
      icon: Sparkles,
      title: "Mulai ulang lalu masuk",
      body: "Formulir masuk hanya muncul saat proyek Supabase asli sudah dikonfigurasi. Tidak ada autentikasi palsu atau bypass kata sandi di sisi klien.",
    },
  ];

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Kembali ke portofolio
          </Link>
          <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-warning">
            Perlu penyiapan
          </span>
        </div>

        <div className="mt-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-card text-accent">
            <LockKeyhole className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <div>
            <p className="eyebrow">Vallozza studio</p>
            <p className="mt-1 text-xs text-muted">Manajemen konten privat</p>
          </div>
        </div>

        <h1 className="mt-8 max-w-3xl text-[clamp(2.3rem,5vw,4.3rem)] font-medium leading-[1.02] tracking-[-0.045em]">
          Arsip tetap milik Anda.
          <span className="serif-italic text-accent"> Tanpa jalan pintas.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
          Studio ini belum terhubung ke backend, jadi belum dapat mengautentikasi siapa pun atau
          mengunggah gambar. Portofolio publik tetap memakai gambar contoh yang diberi label
          jelas. Selesaikan penyiapan di bawah untuk mengaktifkan autentikasi dan penyimpanan
          Supabase yang sebenarnya.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {steps.map((step, index) => (
            <div key={step.title} className="bg-card p-6">
              <div className="flex items-center justify-between">
                <step.icon className="h-4 w-4 text-accent" strokeWidth={1.6} />
                <span className="font-mono text-[9px] text-muted">0{index + 1}</span>
              </div>
              <h2 className="mt-5 text-sm font-medium text-ink">{step.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-[#0b0812] p-5 text-white md:p-6">
          <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-violet-300/60">
            Variabel lingkungan
          </p>
          <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-violet-100/80">
{`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-xs text-ink transition-colors hover:border-accent hover:bg-accent/10"
          >
            Lihat portofolio publik
            <ArrowUpRight className="h-3.5 w-3.5 text-accent transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
            Panduan penyiapan lengkap tersedia di README.md
          </p>
        </div>
      </div>
    </AdminShell>
  );
}

function AdminLogin({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Masukkan email dan kata sandi Anda.");
      return;
    }

    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  return (
    <AdminShell>
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
            <LockKeyhole className="h-3 w-3 text-accent" />
            Studio privat
          </span>
          <h1 className="mt-7 text-[clamp(2.4rem,5vw,4.3rem)] font-medium leading-[1.02] tracking-[-0.045em]">
            Arsip,
            <br />
            <span className="serif-italic text-accent">di bawah kendali Anda.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
            Unggahan galeri, keterangan, kategori, dan status publikasi. Diamankan dengan
            Supabase dan ditegakkan melalui keamanan tingkat baris.
          </p>
          <ul className="mt-8 space-y-3 border-t border-line pt-6">
            {[
              "Kata sandi ditangani oleh Supabase Auth, bukan oleh UI ini.",
              "Hanya akun di admin_users yang dapat menulis data.",
              "Gambar divalidasi dan disimpan di bucket yang dapat dibaca publik.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6 shadow-2xl md:p-8">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Masuk</p>
            <Brand />
          </div>
          <form onSubmit={onSubmit} className="mt-8">
            <div>
              <label htmlFor="admin-email" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                className="field"
                placeholder="admin@example.com"
                required
              />
            </div>
            <div className="mt-5">
              <label htmlFor="admin-password" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                Kata sandi
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  className="field pr-12"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-[var(--invert)] transition-colors hover:bg-accent hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sedang masuk…
                </>
              ) : (
                <>
                  <LockKeyhole className="h-4 w-4" />
                  Masuk ke studio
                </>
              )}
            </button>
          </form>
          <p className="mt-5 border-t border-line pt-4 text-[10px] leading-relaxed text-muted">
            Akun dibuat di dasbor Supabase. Reset kata sandi juga ditangani di sana.
            Studio ini tidak memiliki bypass di sisi klien.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}

function AdminEntry({ supabase, session }: { supabase: SupabaseClient; session: Session }) {
  const [state, setState] = useState<
    | { status: "checking" }
    | { status: "allowed" }
    | { status: "denied"; message: string }
  >({ status: "checking" });

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      const { data, error } = await supabase.rpc("is_admin");
      if (!active) return;
      if (error) {
        setState({
          status: "denied",
          message:
            "Fungsi peran admin tidak dapat diperiksa. Pastikan supabase/schema.sql sudah dipasang. " +
            error.message,
        });
        return;
      }
      if (data === true) {
        setState({ status: "allowed" });
      } else {
        setState({
          status: "denied",
          message:
            "Akun ini sudah terautentikasi tetapi tidak terdaftar di public.admin_users. Tambahkan ID pengguna ke tabel admin untuk memberi akses.",
        });
      }
    }

    checkAdmin();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (state.status === "checking") {
    return <AdminLoading />;
  }

  if (state.status === "denied") {
    return (
      <AdminShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-400/20 bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-warning" strokeWidth={1.4} />
          <h1 className="mt-5 text-2xl font-medium tracking-[-0.03em]">Akses studio ditolak</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{state.message}</p>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Masuk sebagai {session.user.email}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-xs text-ink transition-colors hover:border-accent hover:bg-accent/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-7">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <LockKeyhole className="h-3 w-3 text-accent" />
            Vallozza studio / privat
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] md:text-4xl">
            Galeri <span className="serif-italic text-accent">ruang kendali.</span>
          </h1>
          <p className="mt-2 text-xs text-muted">
            Masuk sebagai {session.user.email}. Hanya admin yang berwenang yang dapat menulis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/#gallery"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Lihat galeri
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar
          </button>
        </div>
      </div>

      <GalleryManager supabase={supabase} />
    </AdminShell>
  );
}
