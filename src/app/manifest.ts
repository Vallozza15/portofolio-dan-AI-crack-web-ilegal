import type { MetadataRoute } from "next";
import { asset } from "@/lib/assets";
import { profile } from "@/data/profile";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: profile.websiteTitle,
    short_name: profile.brand,
    description: profile.description,
    start_url: "/",
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    icons: [
      {
        src: asset("/icons/icon.svg"),
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
