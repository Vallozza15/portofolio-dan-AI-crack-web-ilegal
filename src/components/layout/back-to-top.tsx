"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          aria-label="Kembali ke atas"
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 10 }}
          transition={{ duration: 0.25 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="group fixed bottom-20 right-6 z-40 hidden h-12 w-12 place-items-center rounded-full border border-line-strong bg-[var(--glass)] text-ink shadow-2xl backdrop-blur-xl transition-colors hover:border-accent hover:text-accent md:bottom-24 md:right-8 md:grid"
        >
          <svg
            aria-hidden
            viewBox="0 0 48 48"
            className="absolute inset-0 h-full w-full -rotate-90 p-1"
          >
            <motion.circle
              cx="24"
              cy="24"
              r="22"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.25"
              style={{ pathLength: progress }}
            />
          </svg>
          <ArrowUp className="relative h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
