import type { Metadata } from "next";

// Login sengaja berada di luar route group (shell) agar sidebar OPERATIONS/LABS/PLATFORM
// tidak pernah dirender di halaman ini, walaupun cookie sesi masih aktif.
export const metadata: Metadata = {
  title: "Masuk CTF Intelligence",
  description: "Autentikasi untuk membuka laboratorium CTF Intelligence.",
  robots: { index: false, follow: false },
};

export default function CtfLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
