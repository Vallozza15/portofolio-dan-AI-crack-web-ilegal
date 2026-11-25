import { Plus } from "lucide-react";
import { profile } from "@/data/profile";

export function Marquee() {
  const items = [...profile.focusAreas, ...profile.focusAreas];

  return (
    <div className="marquee relative overflow-hidden border-y border-line bg-surface/60 py-4">
      <div className="marquee-track flex items-center">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex shrink-0 items-center gap-7 pr-7"
            aria-hidden={index >= profile.focusAreas.length}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {item}
            </span>
            <Plus className="h-3 w-3 text-accent/70" strokeWidth={1.5} />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}
