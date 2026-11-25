import { ArrowDownRight, Compass, Router, Wrench } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { experiences } from "@/data/experience";

const icons = [Router, Compass];

export function Experience() {
  return (
    <section
      id="experience"
      aria-labelledby="experience-title"
      className="section-pad relative border-y border-line bg-surface/40"
    >
      <div className="container-page">
        <SectionHeading
          index="02"
          label="Pengalaman"
          title={
            <span id="experience-title">
              Kerja lapangan, tim, &
              <br />
              dunia <span className="serif-italic text-accent">nyata.</span>
            </span>
          }
          intro="Pembelajaran yang terjadi di luar buku teks — di lokasi pelanggan, dengan peralatan teknis, dan dalam lingkungan tim."
        />

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32">
              <Reveal>
                <p className="max-w-xs text-2xl font-medium leading-tight tracking-[-0.03em] md:text-3xl">
                  Pengalaman langsung adalah
                  <span className="serif-italic text-accent"> titik awal.</span>
                </p>
                <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
                  Entri ini menggambarkan pembelajaran dan kegiatan organisasi. Semuanya bukan
                  klaim tanggal kerja, jabatan, atau posisi kepemimpinan.
                </p>
              </Reveal>

              <Reveal delay={0.1} className="mt-10 border-t border-line pt-5">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Entri</span>
                  <span className="font-mono text-[10px] text-muted">
                    {String(experiences.length).padStart(2, "0")}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Hanya latar belakang terverifikasi
                </div>
              </Reveal>

              <Reveal delay={0.16} className="mt-10 hidden lg:block">
                <a
                  href="#achievements"
                  className="group inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
                >
                  Lihat catatan kompetisi
                  <ArrowDownRight className="h-3.5 w-3.5 text-accent transition-transform group-hover:translate-y-0.5" />
                </a>
              </Reveal>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="relative">
              <div
                aria-hidden
                className="absolute bottom-0 left-[13px] top-2 hidden w-px bg-line sm:block"
              />
              <div className="space-y-10 md:space-y-14">
                {experiences.map((experience, index) => {
                  const Icon = icons[index] ?? Wrench;
                  return (
                    <Reveal key={experience.id} delay={index * 0.08}>
                      <article className="group relative sm:pl-12">
                        <div className="absolute left-0 top-1 hidden h-7 w-7 place-items-center rounded-full border border-line bg-card sm:grid">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent transition-transform duration-300 group-hover:scale-150" />
                        </div>

                        <div className="rounded-2xl border border-line bg-bg/60 p-6 transition-colors duration-500 hover:border-line-strong md:p-8">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
                                <Icon className="h-5 w-5" strokeWidth={1.5} />
                              </div>
                              <div>
                                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                                  {String(index + 1).padStart(2, "0")} / {experience.type}
                                </p>
                                <h3 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] md:text-3xl">
                                  {experience.company}
                                </h3>
                                <p className="mt-1 text-sm text-muted">{experience.role}</p>
                              </div>
                            </div>
                            <span className="rounded-full border border-line px-3 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                              Pengalaman belajar
                            </span>
                          </div>

                          <p className="mt-6 max-w-2xl text-sm leading-[1.8] text-muted">
                            {experience.summary}
                          </p>

                          <ul className="mt-6 grid gap-x-8 gap-y-3 border-t border-line pt-6 md:grid-cols-2">
                            {experience.highlights.map((highlight) => (
                              <li
                                key={highlight}
                                className="flex gap-3 text-[13px] leading-relaxed text-muted"
                              >
                                <span className="mt-2 h-px w-3 shrink-0 bg-accent/70" />
                                {highlight}
                              </li>
                            ))}
                          </ul>

                          <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                            <Wrench className="mr-1 h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
                            {experience.tools.map((tool) => (
                              <span
                                key={tool}
                                className="rounded-full border border-line bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted transition-colors group-hover:border-line-strong"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
