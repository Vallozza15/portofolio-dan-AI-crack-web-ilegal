import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Lock,
  Send,
} from "lucide-react";
import { ProjectArtwork } from "@/components/projects/project-artwork";
import { Reveal } from "@/components/ui/reveal";
import { getAdjacentProject, getProject, projects } from "@/data/projects";
import { profile } from "@/data/profile";
import { isSafeHttpUrl } from "@/lib/utils";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return { title: "Proyek tidak ditemukan" };

  return {
    title: project.title,
    description: project.description,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      title: `${project.title} — ${profile.brand}`,
      description: project.description,
      type: "article",
      url: `/projects/${project.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: project.title,
      description: project.description,
    },
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const nextProject = getAdjacentProject(project.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: project.description,
    creator: { "@type": "Person", name: profile.name },
    about: project.topics,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
        <div aria-hidden className="hero-grid absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-0 h-[32rem] w-[32rem] rounded-full bg-accent/10 blur-[130px]"
        />
        <div className="container-page relative">
          <Reveal>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link
                href="/projects"
                className="group inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                Semua proyek
              </Link>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                Studi kasus / {project.index}
              </span>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <Reveal>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-accent-strong">
                    {project.status}
                  </span>
                  {project.topics.slice(0, 2).map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full border border-line px-3 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
                <h1 className="mt-6 max-w-4xl text-balance text-[clamp(2.3rem,5vw,4.8rem)] font-medium leading-[1.02] tracking-[-0.045em]">
                  {project.title}
                </h1>
                <p className="mt-6 max-w-2xl text-sm leading-[1.8] text-muted md:text-base">
                  {project.intro}
                </p>
              </Reveal>
            </div>

            <Reveal delay={0.08}>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
                {project.facts.map((fact) => (
                  <div key={fact.label} className="bg-card p-4">
                    <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                      {fact.label}
                    </dt>
                    <dd className="mt-2 text-xs leading-relaxed text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <Reveal delay={0.12} className="mt-12 md:mt-16">
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              <div className="aspect-[16/9] md:aspect-[2.2/1]">
                <ProjectArtwork kind={project.artwork} />
              </div>
            </div>
          </Reveal>
        </div>
      </article>

      <div className="border-t border-line">
        <div className="container-page grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            {project.sections.map((section, index) => (
              <Reveal
                key={section.heading}
                className={index > 0 ? "mt-12 border-t border-line pt-12" : ""}
              >
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-[9px] text-accent">0{index + 1}</span>
                  <h2 className="text-2xl font-medium tracking-[-0.035em] md:text-3xl">
                    {section.heading}
                  </h2>
                </div>
                <div className="mt-5 space-y-5 pl-0 md:pl-8">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="max-w-2xl text-sm leading-[1.85] text-muted">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Reveal>
            ))}

            <Reveal className="mt-14 flex flex-wrap items-center gap-3 border-t border-line pt-7">
              <Link
                href="/#contact"
                className="group inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-[var(--invert)] transition-colors hover:bg-accent hover:text-white"
              >
                <Send className="h-3.5 w-3.5" />
                Diskusikan proyek ini
              </Link>
              <span className="text-[11px] text-muted">
                Konteks akademik dan cakupan tersedia berdasarkan permintaan.
              </span>
            </Reveal>
          </div>

          <aside className="lg:col-span-4">
            <Reveal className="lg:sticky lg:top-28">
              <div className="rounded-2xl border border-line bg-card p-6">
                <p className="eyebrow">Detail proyek</p>
                <dl className="mt-5 space-y-3 border-t border-line pt-5 text-xs">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                      Kontribusi
                    </dt>
                    <dd className="max-w-[11rem] text-right text-ink">{project.role}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                      Jenis
                    </dt>
                    <dd className="text-right text-ink">{project.subtitle}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                      Status
                    </dt>
                    <dd className="text-right text-ink">{project.status}</dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-line pt-5">
                  <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                    Topik
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {project.topics.map((topic) => (
                      <li
                        key={topic}
                        className="rounded-full border border-line bg-bg/40 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.06em] text-muted"
                      >
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 border-t border-line pt-5">
                  <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                    Tautan
                  </p>
                  <div className="mt-3 space-y-2">
                    {isSafeHttpUrl(project.links.github) ? (
                      <a
                        href={project.links.github}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-xs text-ink transition-colors hover:border-accent/40"
                      >
                        Repositori
                        <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
                      </a>
                    ) : (
                      <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-xs text-muted">
                        Repositori
                        <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted">
                          <Lock className="h-3 w-3" />
                          Belum diterbitkan
                        </span>
                      </div>
                    )}
                    {isSafeHttpUrl(project.links.demo) ? (
                      <a
                        href={project.links.demo}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-xs text-ink transition-colors hover:border-accent/40"
                      >
                        Demo langsung
                        <ExternalLink className="h-3.5 w-3.5 text-accent" />
                      </a>
                    ) : (
                      <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-xs text-muted">
                        Demo langsung
                        <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted">
                          <Lock className="h-3 w-3" />
                          Belum diterbitkan
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-muted">
                    Tidak ada URL placeholder yang dipakai. Tautan hanya muncul saat tujuan asli
                    sudah diisi.
                  </p>
                </div>
              </div>
            </Reveal>
          </aside>
        </div>
      </div>

      {nextProject && (
        <section className="border-t border-line bg-surface/40">
          <div className="container-page py-12 md:py-16">
            <Link href={`/projects/${nextProject.slug}`} className="group block">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="eyebrow">Proyek berikutnya / {nextProject.index}</p>
                  <p className="mt-3 max-w-2xl text-2xl font-medium tracking-[-0.035em] text-ink transition-colors group-hover:text-accent md:text-3xl">
                    {nextProject.title}
                  </p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition-all duration-300 group-hover:border-accent group-hover:bg-accent group-hover:text-white">
                  <ArrowRight className="h-5 w-5" />
                </span>
              </div>
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
