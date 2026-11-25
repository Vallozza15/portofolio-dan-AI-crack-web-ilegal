import Image from "next/image";
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  Crown,
  Expand,
  FileBadge,
  Gamepad2,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { GameAchievements } from "@/components/sections/game-achievements";
import { achievements } from "@/data/achievements";
import { cn, formatDate } from "@/lib/utils";

const typeMeta = {
  award: { icon: Trophy, heading: "Hasil" },
  participation: { icon: ShieldCheck, heading: "Catatan" },
  certification: { icon: BadgeCheck, heading: "Kredensial" },
  rank: { icon: Crown, heading: "Peringkat" },
  game: { icon: Gamepad2, heading: "Gelar" },
} as const;

export function Achievements() {
  return (
    <section id="achievements" aria-labelledby="achievements-title" className="section-pad relative">
      <div className="container-page">
        <SectionHeading
          index="05"
          label="Pencapaian"
          title={
            <span id="achievements-title">
              Hasil, dengan
              <br />
              <span className="serif-italic text-accent">konteks</span> yang tepat.
            </span>
          }
          intro="Perbedaan yang jelas antara meraih posisi, ikut serta, dan menyelesaikan sertifikasi. Setiap kartu menautkan bukti yang tersimpan di arsip pribadi."
        />

        <div className="mt-14 grid gap-5 lg:mt-20 lg:grid-cols-12">
          {achievements.map((achievement, index) => {
            const highlighted = achievement.type !== "participation";
            const meta = typeMeta[achievement.type];
            const Icon = meta.icon;
            const documentUrl = achievement.certificateUrl ?? achievement.image?.src ?? null;
            const documentLabel = achievement.certificateUrl
              ? "Lihat sertifikat"
              : "Lihat dokumentasi";
            const formattedDate = formatDate(achievement.date);

            return (
              <Reveal
                key={achievement.id}
                delay={index * 0.08}
                className={index % 2 === 0 ? "lg:col-span-7" : "lg:col-span-5"}
              >
                <article
                  className={cn(
                    "group relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 transition-colors duration-500 md:p-9",
                    highlighted
                      ? "border-accent/30 bg-gradient-to-br from-accent/[0.09] via-card to-card hover:border-accent/50"
                      : "border-line bg-card hover:border-line-strong",
                  )}
                >
                  <div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-[80px] transition-opacity duration-700",
                      highlighted ? "bg-accent/25" : "bg-white/5",
                    )}
                  />

                  <div className="relative flex items-center justify-between gap-4">
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 font-mono text-[8px] uppercase tracking-[0.18em]",
                        highlighted
                          ? "border-accent/30 bg-accent/10 text-accent-strong"
                          : "border-line bg-bg/40 text-muted",
                      )}
                    >
                      {achievement.badge}
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.16em] text-muted">
                      0{index + 1}
                    </span>
                  </div>

                  {achievement.image && (
                    <a
                      href={documentUrl ?? achievement.image.src}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`${documentLabel}: ${achievement.title}`}
                      className="group/media relative mt-6 block overflow-hidden rounded-xl border border-line bg-bg/50"
                    >
                      <div
                        className={cn(
                          "relative aspect-[4/3] w-full",
                          achievement.imageFit === "contain" && "p-2",
                        )}
                      >
                        <Image
                          src={achievement.image.src}
                          alt={achievement.image.alt}
                          fill
                          sizes="(max-width: 1024px) 100vw, 40vw"
                          className={cn(
                            "transition-transform duration-700 group-hover/media:scale-[1.02]",
                            achievement.imageFit === "contain"
                              ? "object-contain"
                              : "object-cover",
                          )}
                        />
                      </div>
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-white/80 backdrop-blur">
                        <Expand className="h-3 w-3" />
                        Buka dokumen
                      </span>
                    </a>
                  )}

                  <div className="relative mt-7 flex items-start justify-between gap-6">
                    <div className="grid h-16 w-16 place-items-center rounded-full border border-line bg-bg/50">
                      <Icon
                        className={cn("h-7 w-7", highlighted ? "text-accent" : "text-muted")}
                        strokeWidth={1.3}
                      />
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
                        {meta.heading}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-3xl leading-none tracking-[-0.04em] md:text-4xl",
                          highlighted ? "serif-italic text-accent" : "serif-italic text-ink/80",
                        )}
                      >
                        {achievement.result}
                      </p>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted">
                        {achievement.resultNote}
                      </p>
                    </div>
                  </div>

                  <h3 className="relative mt-8 max-w-xl text-balance text-xl font-medium leading-snug tracking-[-0.025em] md:text-2xl">
                    {achievement.title}
                  </h3>
                  <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-muted">
                    {achievement.description}
                  </p>

                  <ul className="relative mt-6 flex flex-wrap gap-2">
                    {achievement.details.map((detail) => (
                      <li
                        key={detail}
                        className="rounded-full border border-line bg-bg/40 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted"
                      >
                        {detail}
                      </li>
                    ))}
                  </ul>

                  <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                    <span className="flex items-center gap-2 text-[11px] text-muted">
                      <FileBadge className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
                      {formattedDate ?? "Tanggal belum diterbitkan"}
                    </span>
                    {documentUrl ? (
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
                      >
                        <Award className="h-3 w-3" strokeWidth={1.5} />
                        {documentLabel}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                        <Award className="h-3 w-3" strokeWidth={1.5} />
                        Dokumen belum diunggah
                      </span>
                    )}
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <GameAchievements />

        <Reveal className="mt-8 flex flex-col gap-3 border-t border-line pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl leading-relaxed">
            Nama kompetisi, tingkat, dan hasil ditampilkan sesuai dokumen yang tersimpan.
            Partisipasi tetap dibedakan dari kemenangan, dan tanggal yang belum terbaca
            dibiarkan kosong.
          </p>
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
            Tanpa angka karangan
          </span>
        </Reveal>
      </div>
    </section>
  );
}
