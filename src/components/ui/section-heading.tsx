import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  index: string;
  label: string;
  title: ReactNode;
  intro?: ReactNode;
  className?: string;
  align?: "split" | "center";
}

export function SectionHeading({
  index,
  label,
  title,
  intro,
  className,
  align = "split",
}: SectionHeadingProps) {
  return (
    <Reveal className={cn("relative", className)}>
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <span className="font-mono text-[10px] tracking-[0.18em] text-accent">/ {index}</span>
        <span className="eyebrow">{label}</span>
        <span aria-hidden className="ml-auto h-px w-12 bg-line-strong sm:w-24" />
      </div>
      <div
        className={cn(
          "mt-8 gap-8 lg:mt-12",
          align === "split"
            ? "grid lg:grid-cols-[1.15fr_0.85fr] lg:items-end"
            : "mx-auto max-w-3xl text-center",
        )}
      >
        <h2 className="text-balance text-[clamp(2.35rem,5.2vw,5rem)] font-medium leading-[0.98] tracking-[-0.045em]">
          {title}
        </h2>
        {intro && (
          <p
            className={cn(
              "max-w-xl text-sm leading-relaxed text-muted md:text-[0.95rem]",
              align === "split" ? "lg:justify-self-end lg:pb-2" : "mx-auto mt-6",
            )}
          >
            {intro}
          </p>
        )}
      </div>
    </Reveal>
  );
}
