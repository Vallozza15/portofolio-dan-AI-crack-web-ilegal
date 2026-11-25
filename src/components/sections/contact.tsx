import { ArrowUpRight, Mail, MessageSquare } from "lucide-react";
import { AvailabilityPill } from "@/components/ui/availability-pill";
import { ContactForm } from "@/components/sections/contact-form";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SocialGlyph } from "@/components/ui/social-icon";
import { profile } from "@/data/profile";
import { socialLinks } from "@/data/social";
import { isSafeHttpUrl } from "@/lib/utils";

const required = ["github", "linkedin", "instagram"] as const;

export function Contact({ deliveryConfigured }: { deliveryConfigured: boolean }) {
  const channels = required
    .map((platform) => socialLinks.find((social) => social.platform === platform))
    .filter((social): social is NonNullable<typeof social> => Boolean(social));

  return (
    <section id="contact" aria-labelledby="contact-title" className="section-pad relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-24 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-[140px]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 right-0 select-none font-mono text-[18vw] font-semibold leading-none tracking-[-0.08em] text-transparent [-webkit-text-stroke:1px_var(--line)]"
      >
        HELLO
      </span>

      <div className="container-page relative">
        <SectionHeading
          index="09"
          label="Kontak"
          title={
            <span id="contact-title">
              Mari bangun sesuatu
              <br />
              yang <span className="serif-italic text-accent">bermakna.</span>
            </span>
          }
          intro="Sebuah pertanyaan, kolaborasi, atau masalah yang layak dipahami — mulailah dengan pesan yang jelas. Tanpa kotak masuk palsu, tanpa pengiriman yang tidak terlihat."
        />

        <div className="mt-14 grid gap-10 lg:mt-20 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <Reveal>
              <AvailabilityPill />
            </Reveal>

            <Reveal delay={0.06} className="mt-8">
              {profile.email ? (
                <a
                  href={`mailto:${profile.email}`}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent/40 md:p-6"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-bg/50 text-accent">
                      <Mail className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
                        Email
                      </p>
                      <p className="mt-1 truncate text-sm text-ink">{profile.email}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                </a>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-card/50 p-5 md:p-6">
                  <div className="flex items-center gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-bg/50 text-muted">
                      <Mail className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
                        Email publik
                      </p>
                      <p className="mt-1 text-sm text-muted">Belum diterbitkan</p>
                    </div>
                  </div>
                  <p className="mt-4 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
                    Tidak ada alamat email yang dikarang untuk situs ini. Formulir kontak tetap
                    menjadi jalur yang dimaksud setelah pengiriman dikonfigurasi.
                  </p>
                </div>
              )}
            </Reveal>

            <Reveal delay={0.1} className="mt-3">
              <div className="rounded-2xl border border-line bg-card/60">
                {channels.map((social, index) => {
                  const active = isSafeHttpUrl(social.url);
                  const row = (
                    <>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-bg/40 text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent">
                        <SocialGlyph platform={social.platform} className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex flex-1 items-center justify-between gap-3">
                        <span className="text-sm text-ink">{social.label}</span>
                        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">
                          {active ? social.handle ?? "Buka profil" : "Belum tertaut"}
                        </span>
                      </span>
                      {active ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted transition-all group-hover:text-accent" />
                      ) : (
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                      )}
                    </>
                  );
                  return (
                    <div
                      key={social.platform}
                      className={index > 0 ? "border-t border-line" : ""}
                    >
                      {active ? (
                        <a
                          href={social.url as string}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group flex items-center gap-3.5 p-4"
                        >
                          {row}
                        </a>
                      ) : (
                        <div
                          aria-disabled="true"
                          title={`${social.label} — belum tertaut`}
                          className="group flex cursor-not-allowed items-center gap-3.5 p-4 opacity-60"
                        >
                          {row}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Reveal>

            <Reveal delay={0.16} className="mt-8 border-t border-line pt-5">
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.5} />
                <p className="max-w-sm text-xs leading-relaxed text-muted">
                  Lebih suka pesan yang terarah? Gunakan formulir. Sertakan konteks yang cukup
                  agar pertanyaannya bisa ditindaklanjuti.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <Reveal delay={0.08}>
              <div className="rounded-2xl border border-line bg-card p-6 md:p-8 lg:p-9">
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
                  <div>
                    <p className="eyebrow">Pesan langsung</p>
                    <h3 className="mt-2 text-2xl font-medium tracking-[-0.03em]">
                      Kirim pesan
                    </h3>
                  </div>
                  <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                    Kolom wajib *
                  </span>
                </div>
                <ContactForm
                  deliveryConfigured={deliveryConfigured}
                  publicEmail={profile.email}
                />
              </div>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mt-5 max-w-2xl text-[10px] leading-relaxed text-muted">
                Formulir ini memvalidasi input di peramban lalu mengirimnya ke endpoint sisi server.
                Pesan berhasil hanya ditampilkan setelah layanan email mengonfirmasi bahwa pesan
                diterima. Tidak ada pesan yang disimpan atau dilaporkan terkirim saat pengiriman
                tidak tersedia.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
