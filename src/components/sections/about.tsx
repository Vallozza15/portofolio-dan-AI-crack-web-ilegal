import { ArrowUpRight, Fingerprint, GraduationCap, Network, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { profile } from "@/data/profile";

const principles = [
  {
    title: "Dasar dulu",
    body: "Pahami mekanismenya sebelum mencari jalan pintas.",
  },
  {
    title: "Belajar sambil praktik",
    body: "Ubah konsep menjadi bagian kerja kecil yang bisa diuji.",
  },
  {
    title: "Dokumentasikan prosesnya",
    body: "Catat apa yang berubah, apa yang gagal, dan mengapa itu penting.",
  },
];

export function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="section-pad relative">
      <div className="container-page">
        <SectionHeading
          index="01"
          label="Tentang"
          title={
            <span id="about-title">
              Pelajar sistem.
              <br />
              Pelajar <span className="serif-italic text-accent">keamanan.</span>
            </span>
          }
          intro="Saya membangun fondasi yang menghubungkan cara sistem dirancang, cara sistem gagal, dan cara mempertahankannya — satu lapis demi satu lapis."
        />

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-14">
          <Reveal className="lg:col-span-4">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0812] p-6 text-white shadow-2xl">
              <div aria-hidden className="dot-field absolute inset-0 opacity-40" />
              <div
                aria-hidden
                className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-500/25 blur-[70px]"
              />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] uppercase tracking-[0.24em] text-white/45">
                    Identitas / 01
                  </span>
                  <Fingerprint className="h-4 w-4 text-violet-300/60" strokeWidth={1.4} />
                </div>

                <div className="mt-12">
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-violet-300/70">
                    {profile.shortRole}
                  </p>
                  <p className="mt-3 max-w-[14rem] text-3xl font-medium leading-[1.05] tracking-[-0.04em] text-white">
                    Muhammad
                    <br />
                    Vallozza <span className="serif-italic text-violet-300">Vito</span>
                  </p>
                </div>

                <div className="mt-10 space-y-0 border-t border-white/10">
                  {[
                    {
                      icon: GraduationCap,
                      label: "Studi",
                      value: "S1 Informatika",
                    },
                    {
                      icon: Network,
                      label: "Dasar",
                      value: "TKJ · Jaringan",
                    },
                    {
                      icon: ShieldCheck,
                      label: "Fokus",
                      value: "Pertahanan siber",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 border-b border-white/10 py-3.5"
                    >
                      <item.icon className="h-3.5 w-3.5 text-white/35" strokeWidth={1.5} />
                      <span className="w-20 font-mono text-[8px] uppercase tracking-[0.16em] text-white/40">
                        {item.label}
                      </span>
                      <span className="text-xs text-white/75">{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto flex items-end justify-between pt-10">
                  <div className="flex gap-[3px]" aria-hidden>
                    {[5, 9, 4, 12, 7, 3, 10, 5, 8, 4, 11, 6, 3, 9].map((height, index) => (
                      <span
                        key={index}
                        className="w-[3px] rounded-full bg-white/25"
                        style={{ height: `${height * 2}px` }}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/35">
                    Portofolio / 2026
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="lg:col-span-8">
            <Reveal>
              <p className="text-pretty text-xl font-medium leading-[1.45] tracking-[-0.02em] text-ink sm:text-2xl md:text-[1.75rem]">
                {profile.bio[0]}
              </p>
            </Reveal>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 sm:gap-10">
              <Reveal delay={0.06}>
                <p className="text-sm leading-[1.8] text-muted">{profile.bio[1]}</p>
              </Reveal>
              <Reveal delay={0.12}>
                <p className="text-sm leading-[1.8] text-muted">{profile.bio[2]}</p>
              </Reveal>
            </div>

            <Reveal delay={0.16} className="mt-12">
              <div className="flex items-center justify-between border-t border-line pt-5">
                <p className="eyebrow">Bidang fokus</p>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  06 arah
                </span>
              </div>
              <ul className="mt-2">
                {profile.focusAreas.map((area, index) => (
                  <li key={area}>
                    <div className="group flex items-center justify-between border-b border-line py-3.5">
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono text-[9px] text-muted">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm text-ink transition-colors group-hover:text-accent md:text-base">
                          {area}
                        </span>
                      </div>
                      <ArrowUpRight className="h-4 w-4 -translate-x-1 text-muted/40 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>

        <Reveal className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:mt-24">
          {principles.map((principle, index) => (
            <div key={principle.title} className="bg-bg p-6 md:p-7">
              <span className="font-mono text-[9px] text-accent">0{index + 1}</span>
              <h3 className="mt-4 text-base font-medium tracking-[-0.02em]">
                {principle.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{principle.body}</p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-14 border-l border-accent/50 pl-6 md:pl-10">
          <p className="serif-italic max-w-3xl text-2xl leading-[1.25] text-ink/85 md:text-4xl">
            “Mulai dari dasar. Uji idenya. Catat apa yang berubah.”
          </p>
        </Reveal>
      </div>
    </section>
  );
}
