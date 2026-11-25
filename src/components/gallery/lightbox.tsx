"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import type { GalleryItem } from "@/types";
import { galleryCategoryLabels } from "@/data/gallery";
import { formatDate, isSafeHttpUrl } from "@/lib/utils";

interface LightboxProps {
  items: GalleryItem[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ items, index, onClose, onNavigate }: LightboxProps) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = index !== null;
  const item = index !== null ? items[index] : null;

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    document.documentElement.classList.add("no-scroll");
    const timer = window.setTimeout(() => closeRef.current?.focus(), 40);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNavigate(((index as number) + 1) % items.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onNavigate(((index as number) - 1 + items.length) % items.length);
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.documentElement.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isOpen, index, items.length, onClose, onNavigate]);

  const formattedDate = formatDate(item?.date ?? null);

  return createPortal(
    <AnimatePresence>
      {isOpen && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md md:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Penampil gambar: ${item.caption}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0b10] text-white shadow-2xl lg:flex-row"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Tutup penampil gambar"
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/55 text-white/80 backdrop-blur-md transition-colors hover:border-white/40 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-3 md:p-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={item.id}
                  src={item.src}
                  alt={item.alt}
                  width={item.width}
                  height={item.height}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.28 }}
                  className="max-h-[42vh] w-auto max-w-full object-contain lg:max-h-[82vh]"
                />
              </AnimatePresence>
            </div>

            <div className="flex max-h-[48vh] w-full shrink-0 flex-col border-t border-white/10 lg:max-h-none lg:w-[21rem] lg:border-l lg:border-t-0">
              <div
                className="min-h-0 flex-1 overflow-y-auto p-5 pr-14 lg:overflow-visible lg:p-6 lg:pr-12"
                tabIndex={0}
                role="group"
                aria-label="Detail gambar"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-white/60">
                    {galleryCategoryLabels[item.category]}
                  </span>
                  {item.isPlaceholder && (
                    <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-violet-200">
                      Gambar contoh
                    </span>
                  )}
                </div>

                <p className="mt-6 text-lg font-medium leading-snug tracking-[-0.02em]">
                  {item.caption}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{item.alt}</p>

                <dl className="mt-6 space-y-3 border-t border-white/10 pt-5 text-[11px]">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-mono uppercase tracking-[0.14em] text-white/60">Koleksi</dt>
                    <dd className="text-white/70">{galleryCategoryLabels[item.category]}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-mono uppercase tracking-[0.14em] text-white/60">Diterbitkan</dt>
                    <dd className="text-white/70">{formattedDate ?? "Tanpa tanggal"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-mono uppercase tracking-[0.14em] text-white/60">Gambar</dt>
                    <dd className="text-white/70">
                      {item.width} × {item.height}
                    </dd>
                  </div>
                </dl>

                {isSafeHttpUrl(item.sourceUrl) && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-6 inline-flex items-center gap-2 self-start rounded-full border border-white/15 px-4 py-2 text-xs text-white/80 transition-colors hover:border-white/30 hover:text-white"
                  >
                    {item.sourceLabel || "Lihat asli"}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}

                {item.isPlaceholder && (
                  <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-white/60">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Ini adalah karya seni placeholder yang dibuat, bukan foto pribadi. Nanti akan
                    diganti dengan gambar yang sudah diizinkan.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 lg:px-6 lg:py-5">
                <button
                  type="button"
                  onClick={() => onNavigate(((index as number) - 1 + items.length) % items.length)}
                  aria-label="Sebelum, gambar sebelumnya"
                  className="group inline-flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-white"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 transition-colors group-hover:border-white/30">
                    <ChevronLeft className="h-4 w-4" />
                  </span>
                  Sebelum
                </button>
                <span className="font-mono text-[9px] tracking-[0.16em] text-white/60">
                  {String((index as number) + 1).padStart(2, "0")} /{" "}
                  {String(items.length).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(((index as number) + 1) % items.length)}
                  aria-label="Berikut, gambar berikutnya"
                  className="group inline-flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-white"
                >
                  Berikut
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 transition-colors group-hover:border-white/30">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
