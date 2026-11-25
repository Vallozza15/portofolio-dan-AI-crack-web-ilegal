"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.addEventListener("storage", callback);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const reduceMotion = useReducedMotion();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vallozza-theme", next);
    } catch {
      /* Storage can be unavailable in private mode. */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#080808" : "#f4f1ea");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Ganti ke mode ${theme === "dark" ? "terang" : "gelap"}`}
      title={`Ganti ke mode ${theme === "dark" ? "terang" : "gelap"}`}
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors duration-300 hover:border-line-strong hover:bg-card",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          data-reveal
          initial={{ rotate: -35, opacity: 0, scale: 0.8 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { rotate: 35, opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="grid place-items-center"
        >
          {theme === "dark" ? (
            <Moon className="h-[17px] w-[17px]" strokeWidth={1.7} />
          ) : (
            <Sun className="h-[17px] w-[17px]" strokeWidth={1.7} />
          )}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">{theme === "dark" ? "Mode gelap" : "Mode terang"}</span>
    </button>
  );
}
