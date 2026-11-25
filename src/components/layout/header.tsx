"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { navItems, profile } from "@/data/profile";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("home");
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });
  const isHome = pathname === "/";

  const navHref = useCallback(
    (id: string) => (isHome ? `#${id}` : `/#${id}`),
    [isHome],
  );

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 18);
      if (!isHome) return;

      const marker = window.scrollY + window.innerHeight * 0.32;
      let current = "home";
      for (const item of navItems) {
        const section = document.getElementById(item.id);
        if (!section) continue;
        const top = section.getBoundingClientRect().top + window.scrollY;
        if (top <= marker) current = item.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48) {
        current = "contact";
      }
      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isHome]);

  useEffect(() => {
    if (!open) {
      document.documentElement.classList.remove("no-scroll");
      return;
    }

    document.documentElement.classList.add("no-scroll");
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = menuRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.documentElement.classList.remove("no-scroll");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-line bg-[var(--glass)] backdrop-blur-xl"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="container-page flex h-[4.5rem] items-center justify-between gap-6 md:h-20">
          <div className="flex items-center gap-5">
            <Brand />
            <span className="hidden h-4 w-px bg-line lg:block" aria-hidden />
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-muted lg:block">
              Portofolio / 2026
            </span>
          </div>

          <nav aria-label="Navigasi utama" className="hidden items-center gap-0.5 xl:flex">
            {navItems.map((item) => {
              const isActive = isHome && active === item.id;
              return (
                <a
                  key={item.id}
                  href={navHref(item.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "relative rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-300",
                    isActive ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {item.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 -z-10 rounded-full border border-line bg-card"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/#contact"
              className="group hidden items-center gap-2 rounded-full border border-line-strong px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink transition-colors hover:border-accent hover:bg-accent/10 sm:inline-flex"
            >
              Mari bicara
              <ArrowUpRight className="h-3.5 w-3.5 text-accent transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
            <ThemeToggle />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Tutup menu" : "Buka menu"}
              className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors hover:border-line-strong hover:bg-card xl:hidden"
            >
              {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        {isHome && (
          <motion.div
            aria-hidden
            style={{ scaleX: progress }}
            className="absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-to-r from-accent via-accent-strong to-transparent"
          />
        )}
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 flex flex-col bg-bg pt-24 xl:hidden"
          >
            <div className="container-page flex flex-1 flex-col overflow-y-auto pb-8">
              <p className="eyebrow mb-6">Navigasi / Indeks</p>
              <nav aria-label="Navigasi seluler" className="flex flex-col border-t border-line">
                {navItems.map((item, index) => (
                  <motion.a
                    key={item.id}
                    href={navHref(item.id)}
                    onClick={() => setOpen(false)}
                    initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + index * 0.045, duration: 0.45 }}
                    className="group flex items-baseline justify-between border-b border-line py-4 text-ink"
                  >
                    <span className="flex items-baseline gap-4">
                      <span className="font-mono text-[10px] text-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-3xl font-medium tracking-[-0.03em] transition-colors group-hover:text-accent sm:text-4xl">
                        {item.label}
                      </span>
                    </span>
                    <ArrowUpRight className="h-5 w-5 -translate-x-1 text-muted opacity-0 transition-all group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
                  </motion.a>
                ))}
              </nav>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-10">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                    {profile.availability.label}
                  </span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
