import { BookOpen, GraduationCap } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { education } from "@/data/profile";

export function Education() {
  return (
    <section id="education" aria-labelledby="education-title" className="section-pad relative border-y border-line bg-surface/40">
      <div className="container-page">
        <SectionHeading
          index="08"
          label="Pendidikan"
          title={
            <span id="education-title">
              Ruang kelas di balik
              <br />
              rasa <span className="serif-italic text-accent">ingin tahu.</span>
            </span>
          }
          intro="Fondasi dalam ilmu komputer dan jaringan, dibangun melalui studi universitas dan pendidikan kejuruan."
        />

        <div className="relative mt-14 lg:mt-20">
          <div aria-hidden className="absolute bottom-0 left-[15px] top-3 hidden w-px bg-line md:block" />
          <div className="space-y-5">
            {education.map((entry, index) => (
              <Reveal key={entry.id} delay={index * 0.08}>
                <article className="group relative md:pl-14">
                  <div className="absolute left-0 top-6 hidden h-8 w-8 place-items-center rounded-full border border-line bg-card md:grid">
                    <span className="h-2 w-2 rounded-full bg-accent transition-transform duration-300 group-hover:scale-125" />
                  </div>

                  <div className="grid gap-6 rounded-2xl border border-line bg-bg/60 p-6 transition-colors duration-500 hover:border-line-strong md:grid-cols-[0.9fr_1.1fr] md:gap-10 md:p-8">
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                          {entry.level}
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.16em] text-muted">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="mt-8 flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card font-mono text-[10px] tracking-[0.08em] text-accent">
                          {entry.shortName.slice(0, 4)}
                        </div>
                        <GraduationCap className="h-4 w-4 text-muted/40" strokeWidth={1.5} />
                      </div>

                      <h3 className="mt-5 text-balance text-2xl font-medium leading-tight tracking-[-0.035em] md:text-3xl">
                        {entry.institution}
                      </h3>
                      <p className="mt-2 text-sm text-accent">{entry.program}</p>
                      {entry.period && (
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                          {entry.period}
                        </p>
                      )}
                    </div>

                    <div className="border-t border-line pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
                      <p className="text-sm leading-[1.8] text-muted">{entry.description}</p>
                      <div className="mt-6">
                        <p className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                          <BookOpen className="h-3 w-3" strokeWidth={1.5} />
                          Mata kuliah relevan
                        </p>
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {entry.coursework.map((course) => (
                            <li
                              key={course}
                              className="rounded-full border border-line bg-card px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.06em] text-muted"
                            >
                              {course}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal className="mt-8 border-t border-line pt-5">
          <p className="text-[11px] leading-relaxed text-muted">
            Periode studi tidak dicantumkan jika belum terverifikasi. Tidak ada tanggal masuk,
            tanggal lulus, atau gelar akademik yang disimpulkan.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
