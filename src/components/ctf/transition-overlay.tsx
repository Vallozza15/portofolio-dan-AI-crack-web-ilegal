"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crosshair } from "lucide-react";

export const CTF_TRANSITION_MS = 900;

type TransitionVariant = "handoff" | "enter";

/** Layar transisi bermerek CTF Intelligence saat berpindah ke /ctf/login atau /ctf. */
export function CtfTransitionOverlay({
  open,
  variant = "handoff",
  label = "Menghubungkan ke CTF Intelligence",
}: {
  open: boolean;
  variant?: TransitionVariant;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const entering = variant === "enter";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ctf-transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.25 }}
          className="ctf fixed inset-0 z-[300] grid place-items-center overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="ctf-grid pointer-events-none absolute inset-0" />
          <motion.div
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.72, y: 16 }}
            animate={{
              opacity: 1,
              scale: reduceMotion ? 1 : entering ? 1.85 : 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: reduceMotion ? 1 : entering ? 2.4 : 1.08,
            }}
            transition={{
              duration: reduceMotion ? 0.01 : entering ? 0.85 : 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative flex flex-col items-center gap-4 px-6"
          >
            <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-[rgba(52,211,153,0.35)] bg-[rgba(6,78,59,0.28)] text-[var(--ctf-green)] shadow-[0_0_60px_-12px_rgba(52,211,153,0.55)]">
              <Crosshair size={38} strokeWidth={1.6} />
            </div>
            <div className="text-center">
              <div className="ctf-mono text-[15px] font-semibold tracking-[0.22em] text-white">
                CTF INTELLIGENCE
              </div>
              <div className="ctf-label mt-1 text-[9px] tracking-[0.22em]">
                AI CYBERSECURITY SOLVER
              </div>
            </div>
            <div className="h-[2px] w-44 overflow-hidden rounded-full bg-[rgba(94,234,212,0.12)]">
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: reduceMotion ? 0.01 : 0.9, ease: "easeInOut" }}
                className="h-full rounded-full bg-[var(--ctf-green)]"
              />
            </div>
            <p className="ctf-mono text-[10px] tracking-wide text-[var(--ctf-muted)]">{label}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
