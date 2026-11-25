import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section className="relative grid min-h-[78svh] place-items-center overflow-hidden px-5 pb-20 pt-32">
      <div aria-hidden className="hero-grid absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]"
      />
      <div className="relative max-w-2xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">Error / 404</p>
        <h1 className="display mt-6 text-[clamp(3.2rem,9vw,7rem)]">
          Tersesat di
          <br />
          <span className="serif-italic text-accent">sinyal.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted">
          Halaman yang Anda cari tidak ada, sudah dipindahkan, atau memang belum pernah
          diterbitkan. Tidak ada tautan rusak yang sengaja dipasang.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm font-medium text-[var(--invert)] transition-colors hover:bg-accent hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Kembali ke beranda
          </Link>
          <Link
            href="/projects"
            className="group inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm text-ink transition-colors hover:border-accent hover:bg-accent/10"
          >
            Jelajahi proyek
            <ArrowUpRight className="h-4 w-4 text-accent transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
