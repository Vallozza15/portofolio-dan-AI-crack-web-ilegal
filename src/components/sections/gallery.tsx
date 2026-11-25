"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, Expand, ImageIcon, Settings2 } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { galleryCategories, galleryCategoryLabels } from "@/data/gallery";
import type { GalleryCategory, GalleryItem } from "@/types";
import { cn } from "@/lib/utils";

const Lightbox = dynamic(
  () => import("@/components/gallery/lightbox").then((module) => module.Lightbox),
  { ssr: false },
);

type Filter = "All" | GalleryCategory;

const INITIAL_COUNT = 8;
const PAGE_SIZE = 6;

export function Gallery({
  items,
  source,
}: {
  items: GalleryItem[];
  source: "supabase" | "local";
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      All: items.length,
      Personal: 0,
      Technology: 0,
      Campus: 0,
      Activities: 0,
      Achievements: 0,
      Projects: 0,
      Photography: 0,
    };
    for (const item of items) base[item.category] += 1;
    return base;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "All" ? items : items.filter((item) => item.category === filter)),
    [filter, items],
  );

  const visible = filtered.slice(0, visibleCount);

  function chooseFilter(next: Filter) {
    setFilter(next);
    setVisibleCount(INITIAL_COUNT);
  }

  return (
    <section id="gallery" aria-labelledby="gallery-title" className="section-pad relative border-y border-line bg-surface/40">
      <div className="container-page">
        <SectionHeading
          index="06"
          label="Galeri"
          title={
            <span id="gallery-title">
              Arsip visual,
              <br />
              <span className="serif-italic text-accent">dalam proses.</span>
            </span>
          }
          intro="Tempat untuk foto pribadi, momen kampus, kerja lapangan, dan catatan kompetisi. Setiap gambar ditambahkan manual oleh pemilik — tidak ada yang diambil otomatis atau dikarang."
        />

        <div className="mt-10 flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.6} />
            <p className="max-w-2xl text-[11px] leading-relaxed text-muted">
              {source === "local"
                ? "Arsip lokal: foto pribadi, dokumentasi kompetisi, dan sertifikat yang diunggah manual oleh pemilik. Gambar proyek yang belum tersedia tetap ditandai sebagai gambar contoh."
                : "Arsip langsung: gambar di bawah ini diterbitkan dari koleksi galeri privat."}
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex shrink-0 items-center gap-1.5 self-start font-mono text-[8px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink sm:self-auto"
          >
            <Settings2 className="h-3 w-3" />
            Kelola galeri
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => chooseFilter("All")}
            aria-pressed={filter === "All"}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
              filter === "All"
                ? "border-ink bg-ink text-[var(--invert)]"
                : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            Semua <span className="ml-1 opacity-70">{counts.All}</span>
          </button>
          {galleryCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => chooseFilter(category)}
              aria-pressed={filter === category}
              disabled={counts[category] === 0}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors disabled:opacity-40",
                filter === category
                  ? "border-ink bg-ink text-[var(--invert)]"
                  : "border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {galleryCategoryLabels[category]}{" "}
              <span className="ml-1 opacity-70">{counts[category]}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
            {filter === "All" ? "Arsip lengkap" : galleryCategoryLabels[filter]}
          </p>
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
            {String(filtered.length).padStart(2, "0")} gambar
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 grid min-h-[18rem] place-items-center rounded-2xl border border-dashed border-line">
            <div className="text-center">
              <Camera className="mx-auto h-6 w-6 text-muted/40" strokeWidth={1.4} />
              <p className="mt-3 text-sm text-muted">Belum ada gambar di koleksi ini.</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={filter}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 columns-2 gap-3 md:columns-3 md:gap-4 xl:columns-4"
            >
              {visible.map((item, visibleIndex) => {
                const filteredIndex = filtered.findIndex((entry) => entry.id === item.id);
                return (
                  <figure
                    key={item.id}
                    className="group mb-3 break-inside-avoid overflow-hidden rounded-xl border border-line bg-card transition-colors duration-300 hover:border-line-strong md:mb-4"
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(filteredIndex)}
                      className="relative block w-full overflow-hidden text-left"
                    >
                      <span className="sr-only">Lihat gambar: </span>
                      <div
                        className="relative w-full overflow-hidden bg-[#0b0812]"
                        style={{ aspectRatio: `${item.width} / ${item.height}` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Gallery URLs can be imported from any host; dimensions are stored per item. */}
                        <img
                          src={item.src}
                          alt={item.alt}
                          width={item.width}
                          height={item.height}
                          loading={visibleIndex < 4 ? "eager" : "lazy"}
                          decoding="async"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                        />
                        <span
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        />
                        <span className="absolute left-3 top-3 hidden rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/70 backdrop-blur-md sm:inline-block">
                          {galleryCategoryLabels[item.category]}
                        </span>
                        {item.isPlaceholder && (
                          <span className="absolute right-3 top-3 rounded-full border border-violet-300/30 bg-violet-950/50 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-violet-200 backdrop-blur-md">
                            Gambar contoh
                          </span>
                        )}
                        <span className="absolute bottom-3 right-3 grid h-8 w-8 translate-y-1 place-items-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 backdrop-blur-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                          <Expand className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </button>
                    <figcaption className="flex items-start justify-between gap-3 border-t border-line px-3 py-2.5">
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted transition-colors group-hover:text-ink">
                        {item.caption}
                      </span>
                      <span className="hidden shrink-0 font-mono text-[8px] tracking-[0.12em] text-muted sm:block">
                        {String(filteredIndex + 1).padStart(2, "0")}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}

        {visibleCount < filtered.length && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="group inline-flex items-center gap-2.5 rounded-full border border-line-strong px-5 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Muat lebih banyak
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-card px-1 text-[8px] text-ink transition-colors group-hover:bg-accent group-hover:text-white">
                {filtered.length - visibleCount}
              </span>
            </button>
          </div>
        )}

        <p className="mt-10 flex items-start gap-2 border-t border-line pt-5 text-[10px] leading-relaxed text-muted">
          <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          Foto tidak pernah diunduh otomatis dari akun pribadi. Hanya gambar yang
          diunggah manual oleh pemilik, atau digunakan dengan izin, yang diterbitkan di sini.
        </p>
      </div>

      <Lightbox
        items={filtered}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </section>
  );
}
