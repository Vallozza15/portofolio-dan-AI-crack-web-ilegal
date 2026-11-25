import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ProjectArtwork } from "@/components/projects/project-artwork";
import type { Project } from "@/types";
import { cn } from "@/lib/utils";

export function ProjectCard({
  project,
  featured = false,
}: {
  project: Project;
  featured?: boolean;
}) {
  return (
    <Link href={`/projects/${project.slug}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-all duration-500 hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_30px_80px_-50px_var(--accent)]">
        <div
          className={cn(
            "relative shrink-0 overflow-hidden border-b border-line",
            featured ? "aspect-[16/10]" : "aspect-[4/3]",
          )}
        >
          <ProjectArtwork
            kind={project.artwork}
            className="transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-white/70 backdrop-blur-md">
              {project.index}
            </span>
            <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-white/60 backdrop-blur-md">
              {project.status}
            </span>
          </div>
          <span className="absolute bottom-4 right-4 grid h-10 w-10 translate-y-2 place-items-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 backdrop-blur-md transition-all duration-400 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="flex flex-1 flex-col p-6 md:p-7">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
            {project.subtitle}
          </p>
          <h3 className="mt-3 text-balance text-xl font-medium leading-snug tracking-[-0.025em] text-ink transition-colors duration-300 group-hover:text-accent md:text-2xl">
            {project.title}
          </h3>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
            {project.description}
          </p>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
            <div className="flex flex-wrap gap-1.5">
              {project.topics.slice(0, 3).map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-line px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted"
                >
                  {topic}
                </span>
              ))}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-muted transition-colors group-hover:text-accent">
              Studi kasus
              <ArrowUpRight className="h-3 w-3 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
        <span className="sr-only">Buka studi kasus</span>
      </article>
    </Link>
  );
}
