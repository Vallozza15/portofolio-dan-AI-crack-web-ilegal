import { profile } from "@/data/profile";
import { cn } from "@/lib/utils";

export function AvailabilityPill({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  if (!profile.availability.available) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-line bg-card/60 py-1.5 pl-2.5 pr-3.5 backdrop-blur",
        className,
      )}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        {label ?? profile.availability.label}
      </span>
    </span>
  );
}
