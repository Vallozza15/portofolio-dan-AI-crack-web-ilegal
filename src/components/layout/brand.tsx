import Link from "next/link";
import { cn } from "@/lib/utils";
import { profile } from "@/data/profile";

export function Brand({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label={`${profile.brand} — beranda`}
      className={cn(
        "group inline-flex items-baseline gap-1 leading-none",
        className,
      )}
    >
      <span className="text-[0.95rem] font-semibold tracking-[0.24em] text-ink">
        {profile.brand}
      </span>
      <span className="text-[1.15rem] leading-none text-accent transition-transform duration-300 group-hover:translate-y-[-2px]">
        .
      </span>
    </Link>
  );
}
