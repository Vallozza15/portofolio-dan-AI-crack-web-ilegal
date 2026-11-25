export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const siteName = "Vallozza";

// Tombol pintasan ke aplikasi AI CTF. Bisa di-override lewat NEXT_PUBLIC_CTF_URL.
export const ctfShortcutOverride =
  process.env.NEXT_PUBLIC_CTF_URL?.replace(/\/$/, "") || "";

export const ctfShortcutUrl = ctfShortcutOverride
  ? `${ctfShortcutOverride}/ctf/login`
  : "/ctf/login";
