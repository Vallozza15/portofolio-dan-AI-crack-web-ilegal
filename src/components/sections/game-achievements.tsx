"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { Crown, Expand, Gamepad2, Trophy } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { gameAchievements } from "@/data/achievements";
import type { GalleryItem } from "@/types";

const Lightbox = dynamic(
  () => import("@/components/gallery/lightbox").then((module) => module.Lightbox),
  { ssr: false },
);

export function GameAchievements() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const mcl = gameAchievements.find((achievement) => achievement.type === "game");
  const mythic = gameAchievements.find((achievement) => achievement.type === "rank");

  if (!mcl) return null;

  const trophies = mcl.trophies ?? [];

  const items: GalleryItem[] = [
    ...trophies.map((trophy, index) => ({
      id: `mcl-trophy-${index}`,
      src: trophy.src,
      alt: trophy.alt,
      caption: `Piala MCL E-Sports Mania — ${trophy.team}`,
      category: "Achievements" as const,
      date: null,
      sourceUrl: null,
      sourceLabel: null,
      width: trophy.width,
      height: trophy.height,
      isPlaceholder: false,
    })),
    ...(mythic?.image
      ? [
          {
            id: "mythic-rank",
            src: mythic.image.src,
            alt: mythic.image.alt,
            caption: mythic.title,
            category: "Achievements" as const,
            date: null,
            sourceUrl: null,
            sourceLabel: null,
            width: mythic.image.width,
            height: mythic.image.height,
            isPlaceholder: false,
          },
        ]
      : []),
  ];

  return (
    <Reveal className="mt-16">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-accent">
            <Gamepad2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            Prestasi game
          </p>
          <h3 className="mt-3 text-balance text-2xl font-medium tracking-[-0.03em] md:text-3xl">
            MCL E-Sports Mania &amp;{" "}
            <span className="serif-italic text-accent">ranked</span>
          </h3>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
          {String(trophies.length).padStart(2, "0")} piala · 01 rank
        </span>
      </div>

      <article className="mt-6 overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] via-card to-card">
        <div className="grid gap-8 p-6 md:p-9 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
          <div className="flex flex-col">
            <span className="w-fit rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-accent-strong">
              {mcl.badge}
            </span>

            <div className="mt-6 flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-line bg-bg/50">
                <Trophy className="h-7 w-7 text-accent" strokeWidth={1.3} />
              </div>
              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
                  Gelar
                </p>
                <p className="serif-italic text-4xl leading-none tracking-[-0.04em] text-accent">
                  {mcl.result}
                </p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                  {mcl.resultNote}
                </p>
              </div>
            </div>

            <h4 className="mt-7 text-balance text-xl font-medium leading-snug tracking-[-0.025em] md:text-2xl">
              {mcl.title}
            </h4>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              {mcl.description}
            </p>

            <ul className="mt-6 flex flex-wrap gap-2">
              {trophies.map((trophy) => (
                <li
                  key={trophy.team}
                  className="rounded-full border border-line bg-bg/40 px-2.5 py-1 font-mono text-[8px] tracking-[0.08em] text-muted"
                >
                  {trophy.team}
                </li>
              ))}
            </ul>

            <p className="mt-auto border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
              Bukti berupa tangkapan layar piala di dalam game. Tanggal turnamen belum
              tercantum pada gambar, jadi tidak dikarang di sini.
            </p>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {trophies.map((trophy, index) => (
                <button
                  key={trophy.team}
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  aria-label={`Perbesar piala MCL tim ${trophy.team}`}
                  className="group relative overflow-hidden rounded-lg border border-line bg-bg/60 transition-colors hover:border-accent/50"
                >
                  <span className="relative block aspect-[16/9] w-full overflow-hidden">
                    <Image
                      src={trophy.src}
                      alt={trophy.alt}
                      fill
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 13vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
                    />
                    <span className="absolute inset-x-2 bottom-1.5 truncate text-left font-mono text-[7px] uppercase tracking-[0.08em] text-white/80">
                      {trophy.team}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-right font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
              Klik piala untuk memperbesar
            </p>
          </div>
        </div>

        {mythic?.image && (
          <button
            type="button"
            onClick={() => setLightboxIndex(trophies.length)}
            aria-label="Perbesar tangkapan layar peringkat Mythic"
            className="group relative block w-full border-t border-line text-left"
          >
            <span className="relative block aspect-[21/9] w-full overflow-hidden sm:aspect-[3/1] lg:aspect-[4/1]">
              <Image
                src={mythic.image.src}
                alt={mythic.image.alt}
                fill
                sizes="100vw"
                className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]"
              />
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent"
              />
              <span className="absolute inset-0 flex items-center justify-between gap-4 p-6 md:p-9">
                <span className="block">
                  <span className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.18em] text-white/60">
                    <Crown className="h-3.5 w-3.5 text-accent" strokeWidth={1.6} />
                    Peringkat ranked
                  </span>
                  <span className="mt-2 block serif-italic text-4xl leading-none tracking-[-0.04em] text-white md:text-5xl">
                    {mythic.result}
                  </span>
                  <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/60">
                    Akun •Ultima_Tempest•
                  </span>
                </span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md transition-colors group-hover:border-white/50">
                  <Expand className="h-4 w-4" />
                </span>
              </span>
            </span>
          </button>
        )}
      </article>

      <Lightbox
        items={items}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </Reveal>
  );
}
