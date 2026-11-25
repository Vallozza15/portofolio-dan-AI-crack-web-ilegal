import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, FlaskConical } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { Reveal } from "@/components/ui/reveal";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "Proyek",
  description:
    "Riset akademik dan proyek pembelajaran Muhammad Vallozza Vito — AI dalam deteksi ancaman siber, warisan budaya, dasar pemrograman, dan latihan MySQL.",
  alternates: { canonical: "/projects" },
};

const spans = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-5", "lg:col-span-7"];

export default function ProjectsPage() {
  return (
    <>
      <section className="relative overflow-hidden pb-16 pt-36 md:pb-20 md:pt-44">
        <div aria-hidden className="hero-grid absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-0 h-[34rem] w-[34rem] rounded-full bg-accent/15 blur-[140px]"
        />
        <div className="container-page relative">
          <Reveal>
            <Link
              href="/"
              className="group inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
              Kembali ke beranda
            </Link>
          </Reveal>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <Reveal>
              <p className="eyebrow mb-5 flex items-center gap-3">
                <span className="h-px w-8 bg-line-strong" />
                Arsip / {String(projects.length).padStart(2, "0")} proyek
              </p>
              <h1 className="display text-[clamp(3rem,7vw,6.5rem)]">
                Karya yang
                <br />
                <span className="serif-italic text-accent">bisa ditelusuri.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="max-w-md text-sm leading-relaxed text-muted lg:pb-2">
                Catatan riset akademik dan latihan yang disengaja. Setiap entri menjelaskan
                subjek, kontribusi, dan batas dari apa yang dibuat — tanpa tautan atau hasil
                yang dikarang.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted">
                  <FlaskConical className="h-3 w-3" />
                  Riset akademik
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted">
                  <BookOpen className="h-3 w-3" />
                  Latihan belajar
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-t border-line py-16 md:py-24">
        <div className="container-page">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
            {projects.map((project, index) => (
              <Reveal
                key={project.slug}
                delay={(index % 2) * 0.06}
                className={spans[index] ?? "lg:col-span-6"}
              >
                <ProjectCard project={project} featured={index % 3 === 0} />
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-14 flex flex-col items-start justify-between gap-5 border-t border-line pt-8 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-ink">Tertarik membaca studi kasus lengkapnya?</p>
              <p className="mt-1 text-xs text-muted">
                Setiap halaman proyek mendokumentasikan konteks, kontribusi, dan cakupannya.
              </p>
            </div>
            <Link
              href="/#contact"
              className="group inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-xs text-ink transition-colors hover:border-accent hover:bg-accent/10"
            >
              Mulai percakapan
              <ArrowUpRight className="h-3.5 w-3.5 text-accent transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
