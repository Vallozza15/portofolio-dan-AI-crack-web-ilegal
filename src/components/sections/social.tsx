import { ArrowUpRight, Link2, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SocialGlyph } from "@/components/ui/social-icon";
import { socialLinks } from "@/data/social";
import { isSafeHttpUrl } from "@/lib/utils";

export function Social() {
  const configuredCount = socialLinks.filter((social) => isSafeHttpUrl(social.url)).length;

  return (
    <section id="social" aria-labelledby="social-title" className="section-pad relative">
      <div className="container-page">
        <SectionHeading
          index="07"
          label="Di tempat lain"
          title={
            <span id="social-title">
              Temukan saya di
              <br />
              <span className="serif-italic text-accent">internet.</span>
            </span>
          }
          intro="Profil, platform, dan tempat karya serta proses belajar terlihat. Tautan dikurasi manual — tidak ada nama pengguna yang ditebak."
        />

        <div className="mt-14 grid gap-10 lg:mt-20 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            <div className="border-t border-line">
              {socialLinks.map((social, index) => {
                const active = isSafeHttpUrl(social.url);
                const content = (
                  <>
                    <span className="hidden font-mono text-[9px] tracking-[0.16em] text-muted sm:block">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-card text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent">
                      <SocialGlyph platform={social.platform} className="h-[15px] w-[15px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <span className="truncate text-xl font-medium tracking-[-0.03em] text-ink transition-colors group-hover:text-accent sm:text-2xl">
                        {social.label}
                      </span>
                      <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted sm:block">
                        {social.handle ??
                          (active
                            ? new URL(social.url as string).hostname.replace("www.", "")
                            : "Tautan menyusul")}
                      </span>
                    </span>
                    {active ? (
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                    ) : (
                      <span className="shrink-0 rounded-full border border-line px-2 py-1 font-mono text-[7px] uppercase tracking-[0.1em] text-muted">
                        Segera
                      </span>
                    )}
                  </>
                );

                return (
                  <Reveal key={social.platform} delay={index * 0.04}>
                    {active ? (
                      <a
                        href={social.url as string}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`${social.label} (dibuka di tab baru)`}
                        className="group flex items-center gap-4 border-b border-line py-5 transition-colors hover:bg-card/40 sm:gap-5 sm:px-2"
                      >
                        {content}
                      </a>
                    ) : (
                      <div
                        aria-disabled="true"
                        title={`${social.label} — tautan profil belum ditambahkan`}
                        className="group flex cursor-not-allowed items-center gap-4 border-b border-line py-5 opacity-60 sm:gap-5 sm:px-2"
                      >
                        {content}
                      </div>
                    )}
                  </Reveal>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4">
            <Reveal className="lg:sticky lg:top-32">
              <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-6 md:p-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/15 blur-[60px]"
                />
                <div className="relative flex items-center justify-between">
                  <span className="eyebrow">Status tautan</span>
                  <Link2 className="h-4 w-4 text-accent" strokeWidth={1.5} />
                </div>
                <p className="relative mt-8 font-mono text-6xl leading-none tracking-[-0.06em] text-ink">
                  {String(configuredCount).padStart(2, "0")}
                  <span className="text-2xl text-muted">/06</span>
                </p>
                <p className="relative mt-3 text-sm leading-relaxed text-muted">
                  {configuredCount === 0
                    ? "URL profil belum diterbitkan. Enam slot platform sudah siap — masing-masing baru aktif ketika pemilik menambahkan tautan asli."
                    : "Beberapa profil sudah aktif. Setiap tautan di sini ditambahkan dan diverifikasi oleh pemilik situs."}
                </p>
                <div className="relative mt-6 space-y-3 border-t border-line pt-5">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={1.6} />
                    <p className="text-[11px] leading-relaxed text-muted">
                      Tanpa scraping, tanpa menebak nama pengguna, tanpa URL profil otomatis.
                    </p>
                  </div>
                </div>
                <p className="relative mt-6 font-mono text-[8px] uppercase leading-relaxed tracking-[0.14em] text-muted">
                  Tautan tetap nonaktif sampai dikonfigurasi
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
