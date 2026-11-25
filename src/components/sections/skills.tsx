"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Code2, Cpu, Network, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { skillCategories } from "@/data/skills";
import type { SkillCategoryId } from "@/types";
import { cn } from "@/lib/utils";

const icons = [Code2, ShieldCheck, Network, Cpu];

export function Skills() {
  const [activeId, setActiveId] = useState<SkillCategoryId>("programming");
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = skillCategories.findIndex((category) => category.id === activeId);
  const active = useMemo(
    () => skillCategories.find((category) => category.id === activeId) ?? skillCategories[0],
    [activeId],
  );
  const ActiveIcon = icons[activeIndex] ?? Code2;

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = (index + 1) % skillCategories.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index - 1 + skillCategories.length) % skillCategories.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = skillCategories.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const category = skillCategories[next];
    setActiveId(category.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="skills" aria-labelledby="skills-title" className="section-pad relative overflow-hidden">
      <div className="container-page">
        <SectionHeading
          index="03"
          label="Keahlian"
          title={
            <span id="skills-title">
              Keahlian yang
              <br />
              sedang <span className="serif-italic text-accent">bertumbuh.</span>
            </span>
          }
          intro="Bidang yang sudah saya pelajari dan praktikkan. Tanpa persentase, tanpa nilai karangan — hanya peta jujur tentang arah pembelajaran."
        />

        <div className="mt-14 grid gap-6 lg:mt-20 lg:grid-cols-12 lg:gap-8">
          <div
            role="tablist"
            aria-label="Kategori keahlian"
            aria-orientation="vertical"
            className="grid grid-cols-2 gap-2 lg:col-span-4 lg:flex lg:flex-col"
          >
            {skillCategories.map((category, index) => {
              const Icon = icons[index] ?? Code2;
              const selected = category.id === activeId;
              return (
                <button
                  key={category.id}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`skill-tab-${category.id}`}
                  aria-selected={selected}
                  aria-controls={`skill-panel-${category.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(category.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={cn(
                    "group relative flex min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left transition-colors duration-300 lg:px-5 lg:py-5",
                    selected
                      ? "border-line-strong bg-card text-ink"
                      : "border-line bg-transparent text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        "h-4 w-4 transition-colors",
                        selected ? "text-accent" : "text-muted",
                      )}
                      strokeWidth={1.6}
                    />
                    <span className="whitespace-nowrap text-sm font-medium">{category.label}</span>
                  </span>
                  <span className="hidden font-mono text-[8px] tracking-[0.16em] text-muted lg:block">
                    0{index + 1}
                  </span>
                  {selected && (
                    <motion.span
                      layoutId="skill-tab-indicator"
                      className="absolute inset-y-3 left-0 w-[2px] rounded-full bg-accent"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                </button>
              );
            })}

            <div className="mt-auto hidden border-t border-line pt-6 lg:block">
              <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-muted">
                Catatan belajar
                <br />
                bukan skor kemahiran
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="relative min-h-[25rem] overflow-hidden rounded-2xl border border-line bg-surface/60 p-6 md:p-9 lg:min-h-[28rem]">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-[90px]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25 [mask-image:radial-gradient(ellipse_at_70%_20%,black,transparent_65%)]"
              />
              <span
                aria-hidden
                className="absolute -bottom-8 right-3 select-none font-mono text-[9rem] leading-none text-transparent [-webkit-text-stroke:1px_var(--line)] md:text-[13rem]"
              >
                0{activeIndex + 1}
              </span>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active.id}
                  role="tabpanel"
                  id={`skill-panel-${active.id}`}
                  aria-labelledby={`skill-tab-${active.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex h-full flex-col"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <ActiveIcon className="h-4 w-4 text-accent" strokeWidth={1.5} />
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                        {active.kicker}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                      {String(active.skills.length).padStart(2, "0")} bidang
                    </span>
                  </div>

                  <h3 className="mt-5 text-3xl font-medium tracking-[-0.04em] md:text-4xl">
                    {active.label}
                  </h3>
                  <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
                    {active.description}
                  </p>

                  <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
                    {active.skills.map((skill, index) => (
                      <div
                        key={skill}
                        className="group flex items-center justify-between gap-3 bg-bg/80 px-4 py-4 transition-colors hover:bg-card"
                      >
                        <span className="flex items-center gap-3 text-sm text-ink">
                          <span className="font-mono text-[8px] text-accent-strong">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {skill}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 -translate-x-1 text-muted/30 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
                      </div>
                    ))}
                  </div>

                  <p className="mt-auto pt-8 font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                    Bidang latihan · hanya konteks belajar yang dinilai sendiri
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
