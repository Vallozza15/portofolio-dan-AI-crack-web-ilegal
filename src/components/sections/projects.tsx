import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { projects } from "@/data/projects";

const spans = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-5", "lg:col-span-7"];
const featured = [true, false, false, true];

export function Projects() {
  return (
    <section
      id="projects"
      aria-labelledby="projects-title"
      className="section-pad relative border-y border-line bg-surface/40"
    >
      <div className="container-page">
        <SectionHeading
          index="04"
          label="Proyek"
          title={
            <span id="projects-title">
              Karya pilihan,
              <br />
              dibuat untuk <span className="serif-italic text-accent">memahami.</span>
            </span>
          }
          intro="Riset akademik dan latihan yang disengaja. Setiap proyek mendokumentasikan subjek, proses, dan batas dari apa yang benar-benar dibuat."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:mt-20 lg:grid-cols-12 lg:gap-6">
          {projects.map((project, index) => (
            <Reveal
              key={project.slug}
              delay={(index % 2) * 0.08}
              className={spans[index] ?? "lg:col-span-6"}
            >
              <ProjectCard project={project} featured={featured[index]} />
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 flex flex-col gap-5 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex max-w-xl items-start gap-2.5 text-xs leading-relaxed text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.6} />
            Repositori dan demo langsung belum diterbitkan. Tidak ada URL placeholder yang dipakai.
          </p>
          <Link
            href="/projects"
            className="group inline-flex shrink-0 items-center gap-2 self-start font-mono text-[9px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink sm:self-auto"
          >
            Semua proyek
            <ArrowRight className="h-3.5 w-3.5 text-accent transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
