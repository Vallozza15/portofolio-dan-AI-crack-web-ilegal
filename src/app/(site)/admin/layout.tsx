import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studio",
  description: "Private gallery management for the Vallozza portfolio.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
