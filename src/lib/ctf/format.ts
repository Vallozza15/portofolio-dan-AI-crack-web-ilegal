import type { CtfCategory, Difficulty, VerificationStatus } from "./types";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value: string): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "—";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDateTime(value);
}

export const CATEGORY_LABELS: Record<CtfCategory, string> = {
  cryptography: "Cryptography",
  forensics: "Forensics",
  steganography: "Steganography",
  web: "Web Security",
  reverse: "Reverse Engineering",
  binary: "Binary Analysis",
  osint: "OSINT",
  misc: "Miscellaneous",
};

export const CATEGORY_TONES: Record<CtfCategory, "green" | "cyan" | "amber" | "rose" | "violet"> = {
  cryptography: "violet",
  forensics: "cyan",
  steganography: "green",
  web: "amber",
  reverse: "rose",
  binary: "rose",
  osint: "cyan",
  misc: "violet",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  insane: "Insane",
  unknown: "Unknown",
};

export function statusTone(status: VerificationStatus): "green" | "amber" | "rose" | "cyan" {
  if (status === "VERIFIED") return "green";
  if (status === "LIKELY") return "cyan";
  if (status === "INCOMPLETE") return "amber";
  return "rose";
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
