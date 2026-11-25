"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";
import { cn, statusTone } from "@/lib/ctf/format";
import type { VerificationStatus } from "@/lib/ctf/types";

export function Panel({
  children,
  title,
  subtitle,
  actions,
  className,
  noPadding,
}: {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section className={cn("ctf-panel", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ctf-line)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[13.5px] font-semibold tracking-tight text-[#ecfdf5]">{title}</h2>}
            {subtitle && <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ctf-muted)]">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="ctf-label mb-2 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ctf-green)] shadow-[0_0_8px_var(--ctf-green)]" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-[var(--ctf-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const tone = statusTone(status);
  const classes = {
    green: "ctf-badge-green",
    cyan: "ctf-badge-cyan",
    amber: "ctf-badge-amber",
    rose: "ctf-badge-rose",
  };
  return <span className={cn("ctf-badge", classes[tone])}>{status}</span>;
}

export function Badge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: "green" | "cyan" | "amber" | "rose" | "violet";
  className?: string;
}) {
  return (
    <span className={cn("ctf-badge", tone && `ctf-badge-${tone}`, className)}>{children}</span>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: "green" | "cyan" | "amber" | "violet" | "rose";
}) {
  const tones = {
    green: "text-[#6ee7b7] border-[rgba(52,211,153,0.22)] bg-[rgba(6,78,59,0.18)]",
    cyan: "text-[#67e8f9] border-[rgba(34,211,238,0.22)] bg-[rgba(8,51,68,0.18)]",
    amber: "text-[#fcd34d] border-[rgba(251,191,36,0.22)] bg-[rgba(69,45,5,0.18)]",
    violet: "text-[#c4b5fd] border-[rgba(167,139,250,0.22)] bg-[rgba(46,16,101,0.18)]",
    rose: "text-[#fda4af] border-[rgba(251,113,133,0.22)] bg-[rgba(76,5,25,0.18)]",
  };
  return (
    <div className="ctf-panel-flat ctf-panel-hover p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="ctf-label">{label}</span>
        {icon && <span className={cn("rounded-md border p-1.5", tones[tone])}>{icon}</span>}
      </div>
      <div className="ctf-stat-value mt-3 text-2xl text-white">{value}</div>
      {detail && <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--ctf-dim)]">{detail}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--ctf-line)] bg-[rgba(3,12,21,0.35)] px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ctf-line)] bg-[rgba(14,33,51,0.6)] text-[var(--ctf-green)]">
        <span className="ctf-mono text-lg">_</span>
      </div>
      <p className="text-[13px] font-medium text-[#d1fae5]">{title}</p>
      {description && <p className="mt-1 max-w-md text-[11.5px] leading-relaxed text-[var(--ctf-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ctf-btn ctf-btn-sm ctf-btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  danger,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  danger?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.35)] p-3">
      <span>
        <span className={cn("block text-[12px] font-medium", danger ? "text-[#fecdd3]" : "text-[#d1fae5]")}>{label}</span>
        {description && <span className="mt-1 block text-[11px] leading-relaxed text-[var(--ctf-muted)]">{description}</span>}
      </span>
      <span
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition",
          checked
            ? "border-[rgba(52,211,153,0.6)] bg-[rgba(52,211,153,0.28)]"
            : "border-[var(--ctf-line)] bg-[rgba(8,19,31,0.9)]",
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={cn(
            "ml-0.5 h-3.5 w-3.5 rounded-full transition",
            checked ? "translate-x-4 bg-[#6ee7b7]" : "translate-x-0 bg-[#5c7482]",
          )}
        />
      </span>
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="ctf-label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-relaxed text-[var(--ctf-dim)]">{hint}</span>}
    </label>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[rgba(251,113,133,0.35)] bg-[rgba(127,29,29,0.18)] px-3 py-2 text-[11.5px] leading-relaxed text-[#fecdd3]">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11.5px] text-[var(--ctf-muted)]">
      <Loader2 size={14} className="animate-spin text-[var(--ctf-green)]" />
      {label || "Memproses…"}
    </span>
  );
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 border-b border-[var(--ctf-line)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="ctf-tab"
          data-active={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-[10px] text-[var(--ctf-dim)]">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--ctf-line)] py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="ctf-label shrink-0">{label}</span>
      <span className="min-w-0 break-words text-right text-[11.5px] text-[#d1fae5]">{children}</span>
    </div>
  );
}
