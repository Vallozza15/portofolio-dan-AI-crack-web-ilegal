import type { Metadata } from "next";
import { Hero } from "@/components/sections/hero";
import { Marquee } from "@/components/ui/marquee";
import { About } from "@/components/sections/about";
import { Experience } from "@/components/sections/experience";
import { Skills } from "@/components/sections/skills";
import { Projects } from "@/components/sections/projects";
import { Achievements } from "@/components/sections/achievements";
import { Gallery } from "@/components/sections/gallery";
import { Social } from "@/components/sections/social";
import { Education } from "@/components/sections/education";
import { Contact } from "@/components/sections/contact";
import { getGalleryItems } from "@/lib/gallery";
import { isContactDeliveryConfigured } from "@/lib/contact";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Vallozza — Portofolio Pribadi",
  description:
    "Mahasiswa Informatika yang mendalami keamanan siber, jaringan komputer, pemrograman, AI, dan sistem di balik layar.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const { items, source } = await getGalleryItems();

  return (
    <>
      <Hero />
      <Marquee />
      <About />
      <Experience />
      <Skills />
      <Projects />
      <Achievements />
      <Gallery items={items} source={source} />
      <Social />
      <Education />
      <Contact deliveryConfigured={isContactDeliveryConfigured()} />
    </>
  );
}
