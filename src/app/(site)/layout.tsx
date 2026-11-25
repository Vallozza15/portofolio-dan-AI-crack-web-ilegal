import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BackToTop } from "@/components/layout/back-to-top";
import { CtfShortcut } from "@/components/layout/ctf-shortcut";
import { profile, education } from "@/data/profile";
import { socialLinks } from "@/data/social";
import { siteName, siteUrl } from "@/lib/site";
import { isSafeHttpUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    default: profile.websiteTitle,
    template: `%s — ${siteName}`,
  },
  description: profile.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "/",
    siteName: profile.brand,
    title: profile.websiteTitle,
    description: profile.description,
  },
  twitter: {
    card: "summary_large_image",
    title: profile.websiteTitle,
    description: profile.description,
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    alternateName: profile.brand,
    url: siteUrl,
    description: profile.description,
    jobTitle: "Mahasiswa Informatika",
    knowsAbout: profile.focusAreas,
    alumniOf: education.map((entry) => ({
      "@type": "EducationalOrganization",
      name: entry.institution,
    })),
    sameAs: socialLinks
      .filter((social) => isSafeHttpUrl(social.url))
      .map((social) => social.url),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--invert)] transition-transform focus:translate-y-0"
      >
        Lewati ke konten
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
      <BackToTop />
      <CtfShortcut />
      <div aria-hidden className="art-noise fixed inset-0 z-[60] mix-blend-soft-light" />
    </>
  );
}
