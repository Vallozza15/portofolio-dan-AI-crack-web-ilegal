import Link from "next/link";
import { ArrowUpRight, LockKeyhole, Mail } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { SocialGlyph } from "@/components/ui/social-icon";
import { navItems, profile } from "@/data/profile";
import { socialLinks } from "@/data/social";
import { cn, isSafeHttpUrl } from "@/lib/utils";

const footerItems = ["Beranda", "Tentang", "Pengalaman", "Proyek", "Galeri", "Kontak"];

export function Footer() {
  const year = new Date().getFullYear();
  const configured = socialLinks.filter((social) => isSafeHttpUrl(social.url));

  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-0 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-[130px]"
      />
      <div className="container-page relative">
        <div className="grid gap-10 border-b border-line py-14 md:grid-cols-[1.1fr_0.9fr] md:py-16">
          <div>
            <p className="eyebrow mb-4">Bab berikutnya</p>
            <p className="max-w-xl text-3xl font-medium leading-[1.08] tracking-[-0.04em] sm:text-4xl md:text-5xl">
              Punya masalah yang layak
              <span className="serif-italic text-accent"> dipahami?</span>
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/#contact"
                className="group inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm font-medium text-[var(--invert)] transition-colors hover:bg-accent hover:text-white"
              >
                Mulai percakapan
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              {profile.email && (
                <a
                  href={`mailto:${profile.email}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm text-ink transition-colors hover:border-line-strong hover:bg-card"
                >
                  <Mail className="h-4 w-4 text-accent" />
                  Email saya
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 md:justify-items-end">
            <nav aria-label="Navigasi footer">
              <p className="eyebrow mb-4">Indeks</p>
              <ul className="space-y-2.5">
                {footerItems.map((label) => {
                  const item = navItems.find((entry) => entry.label === label);
                  if (!item) return null;
                  return (
                    <li key={label}>
                      <Link
                        href={`/#${item.id}`}
                        className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
                      >
                        <span className="h-px w-3 bg-line-strong transition-all duration-300 group-hover:w-5 group-hover:bg-accent" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div>
              <p className="eyebrow mb-4">Di tempat lain</p>
              <ul className="grid grid-cols-3 gap-2 md:grid-cols-2">
                {socialLinks.map((social) =>
                  isSafeHttpUrl(social.url) ? (
                    <li key={social.platform}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`${social.label} (dibuka di tab baru)`}
                        title={social.label}
                        className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent"
                      >
                        <SocialGlyph platform={social.platform} />
                      </a>
                    </li>
                  ) : (
                    <li key={social.platform}>
                      <span
                        title={`${social.label} — tautan profil belum ditambahkan`}
                        className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-full border border-line text-muted/40"
                      >
                        <SocialGlyph platform={social.platform} />
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <p className="mt-3 max-w-[9.5rem] font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-muted">
                {configured.length === 0
                  ? "Tautan profil menyusul"
                  : "Terhubung di media sosial"}
              </p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden py-10 md:py-14">
          <div className="flex items-center justify-between">
            <Brand />
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-muted sm:block">
              {profile.footerTagline}
            </span>
          </div>
          <p
            aria-hidden
            className="mt-6 select-none text-[clamp(4.3rem,16.4vw,15.7rem)] font-semibold leading-[0.78] tracking-[-0.065em] text-transparent [-webkit-text-stroke:1px_var(--line-strong)]"
          >
            VALLOZZA.
          </p>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[-2rem] left-1/2 h-40 w-[70%] -translate-x-1/2 rounded-full bg-accent/10 blur-[90px]"
          />
        </div>

        <div className="flex flex-col gap-4 border-t border-line py-6 text-[11px] text-muted md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {profile.copyrightName}. Hak cipta dilindungi.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-mono uppercase tracking-[0.14em]">Dibuat dengan niat</span>
            <Link
              href="/admin"
              className={cn(
                "inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em] transition-colors hover:text-ink",
              )}
            >
              <LockKeyhole className="h-3 w-3" />
              Studio
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
