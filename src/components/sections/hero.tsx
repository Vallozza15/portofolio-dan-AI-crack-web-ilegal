"use client";

import { useState } from "react";
import { asset } from "@/lib/assets";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowDownToLine, ArrowUpRight, Download, Sparkles } from "lucide-react";
import { AvailabilityPill } from "@/components/ui/availability-pill";
import { SocialGlyph } from "@/components/ui/social-icon";
import { profile } from "@/data/profile";
import { socialLinks } from "@/data/social";
import { isSafeHttpUrl } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduceMotion = useReducedMotion();
  const [cvNote, setCvNote] = useState(false);

  const lines = [
    <>
      Membangun <span className="serif-italic text-accent">Ide.</span>
    </>,
    <>
      Menjelajahi <span className="serif-italic">Teknologi.</span>
    </>,
    <>Menjaga Masa Depan</>,
    <span key="future" className="serif-italic text-gradient inline-block">
      Digital.
    </span>,
  ];

  return (
    <section
      id="home"
      aria-labelledby="hero-title"
      className="relative flex min-h-[100svh] items-center overflow-hidden pb-12 pt-28 md:pb-16 md:pt-32"
    >
      <div aria-hidden className="hero-grid absolute inset-0" />
      <div
        aria-hidden
        className="glow-pulse pointer-events-none absolute -right-32 top-[8%] h-[36rem] w-[36rem] rounded-full bg-accent/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 bottom-[8%] h-[24rem] w-[24rem] rounded-full bg-violet-500/10 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent"
      />

      <div className="container-page relative z-10">
        <div className="grid items-center gap-14 lg:grid-cols-[1.28fr_0.72fr] lg:gap-10 xl:gap-16">
          <div>
            <motion.div
              data-reveal
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease }}
              className="mb-8 flex flex-wrap items-center gap-4 md:mb-10"
            >
              <AvailabilityPill />
              <span aria-hidden className="hidden h-px w-10 bg-line-strong sm:block" />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                Portofolio <span className="text-accent">/</span> 2026
              </p>
            </motion.div>

            <h1
              id="hero-title"
              className="display text-[clamp(2.85rem,7.1vw,5.35rem)]"
            >
              {lines.map((line, index) => (
                <span key={index} className="block overflow-hidden pb-[0.08em]">
                  <motion.span
                    data-reveal
                    className="block"
                    initial={{ y: "105%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.95, delay: 0.12 + index * 0.09, ease }}
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>

            <motion.div
              data-reveal
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.52, ease }}
              className="mt-8 max-w-xl border-l border-line pl-5 md:mt-10"
            >
              <p className="text-pretty text-sm leading-relaxed text-muted md:text-base">
                {profile.intro}
              </p>
            </motion.div>

            <motion.div
              data-reveal
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.64, ease }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center md:mt-10"
            >
              <a
                href="#projects"
                className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-[var(--invert)] transition-colors duration-300 hover:bg-accent hover:text-white"
              >
                Lihat proyek saya
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>

              {profile.cvUrl ? (
                <a
                  href={profile.cvUrl}
                  download
                  className="group inline-flex items-center justify-center gap-2.5 rounded-full border border-line-strong px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent/10"
                >
                  <Download className="h-4 w-4 text-accent" />
                  Unduh CV
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setCvNote((value) => !value)}
                  aria-describedby="cv-note"
                  className="group inline-flex items-center justify-center gap-2.5 rounded-full border border-line px-6 py-3.5 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  <ArrowDownToLine className="h-4 w-4 text-accent" />
                  Unduh CV
                  <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted">
                    segera
                  </span>
                </button>
              )}
            </motion.div>

            <AnimatePresence>
              {cvNote && (
                <motion.p
                  id="cv-note"
                  role="status"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 text-xs text-muted"
                >
                  CV belum diterbitkan di situs ini. Anda dapat menambahkan PDF-nya dan
                  mengaktifkan tombol ini saat sudah siap.
                </motion.p>
              )}
            </AnimatePresence>

            <motion.div
              data-reveal
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.82 }}
              className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3"
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                Temukan saya
              </span>
              <span aria-hidden className="h-px w-4 bg-line" />
              <div className="flex items-center gap-1.5">
                {socialLinks.map((social) =>
                  isSafeHttpUrl(social.url) ? (
                    <a
                      key={social.platform}
                      href={social.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`${social.label} (dibuka di tab baru)`}
                      className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-all duration-300 hover:-translate-y-0.5 hover:border-accent hover:text-accent"
                    >
                      <SocialGlyph platform={social.platform} />
                    </a>
                  ) : (
                    <span
                      key={social.platform}
                      title={`${social.label} — tautan belum ditambahkan`}
                      className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-full border border-line/70 text-muted/35"
                    >
                      <SocialGlyph platform={social.platform} />
                    </span>
                  ),
                )}
              </div>
              <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                Tautan menyusul
              </span>
            </motion.div>
          </div>

          <motion.aside
            data-reveal
            aria-label="Foto Muhammad Vallozza Vito di acara Cyber Security"
            initial={{ opacity: 0, y: 36, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 1, delay: 0.3, ease }}
            className="relative mx-auto w-full max-w-[25rem] lg:mx-0 lg:ml-auto"
          >
            <div
              aria-hidden
              className="orbit-spin absolute -inset-7 rounded-[2.5rem] border border-dashed border-line"
            />
            <div
              aria-hidden
              className="absolute -inset-3 rounded-[2rem] border border-line/70"
            />

            <div className="relative overflow-hidden rounded-[1.75rem] border border-line-strong bg-card/80 p-2.5 shadow-[0_40px_100px_-40px_rgba(139,92,246,0.45)] backdrop-blur">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.2rem] bg-[#0b0812]">
                <Image
                  src={asset("/images/portrait/vallozza.png")}
                  alt="Muhammad Vallozza Vito berdiri di depan latar acara Cyber Security bertema maskot gajah"
                  fill
                  priority
                  sizes="(max-width: 1023px) 88vw, 25rem"
                  className="object-cover object-[center_55%]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/25"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[1.2rem] ring-1 ring-inset ring-white/10"
                />

                <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
                  <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-white/75 backdrop-blur">
                    Foto pribadi
                  </span>
                  <span className="font-mono text-[8px] tracking-[0.2em] text-white/40">
                    NO. 01
                  </span>
                </div>

                <div className="absolute inset-x-4 bottom-4">
                  <div className="flex items-end justify-between gap-3 border-t border-white/15 pt-3">
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/60">
                        Muhammad Vallozza Vito
                      </p>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-violet-200/70">
                        Informatika / Keamanan
                      </p>
                    </div>
                    <Sparkles className="h-4 w-4 text-violet-300/70" strokeWidth={1.4} />
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              aria-hidden
              animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
              className="float-slow absolute -left-3 top-[22%] hidden items-center gap-2 rounded-full border border-line-strong bg-[var(--glass)] px-3 py-2 shadow-xl backdrop-blur-md sm:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                Keamanan Siber
              </span>
            </motion.div>

            <motion.div
              aria-hidden
              animate={reduceMotion ? undefined : { y: [0, 9, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-3 bottom-[18%] hidden items-center gap-2 rounded-full border border-line-strong bg-[var(--glass)] px-3 py-2 shadow-xl backdrop-blur-md sm:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                Jaringan
              </span>
            </motion.div>

            <div aria-hidden className="absolute -bottom-6 -left-6 hidden h-16 w-16 border-b border-l border-line sm:block" />
            <span className="absolute -right-6 -top-6 hidden font-mono text-[8px] uppercase tracking-[0.2em] text-muted sm:block">
              Gbr. 01
            </span>
          </motion.aside>
        </div>

        <motion.div
          data-reveal
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="mt-14 flex items-center justify-between border-t border-line pt-5 md:mt-20"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-8 w-5 items-start justify-center rounded-full border border-line-strong pt-1.5">
              <span className="animate-scroll-cue h-2 w-px bg-accent" />
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-muted">
              Gulir untuk menjelajah
            </span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            {[
              ["Studi", "Informatika · UNPAM"],
              ["Dasar", "TKJ · Jaringan"],
              ["Fokus", "Pertahanan siber"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                  {label}
                </span>
                <span className="h-3 w-px bg-line" />
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                  {value}
                </span>
              </div>
            ))}
          </div>
          <a
            href="#about"
            aria-label="Lompat ke Tentang"
            className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
