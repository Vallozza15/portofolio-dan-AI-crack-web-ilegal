import type { SocialLink } from "@/types";

/**
 * Add your own profile URLs here. No usernames or handles are invented.
 * A null URL renders a clearly unconfigured state instead of a broken link.
 */
export const socialLinks: SocialLink[] = [
  {
    platform: "instagram",
    label: "Instagram",
    url: null,
    handle: null,
  },
  {
    platform: "tiktok",
    label: "TikTok",
    url: null,
    handle: null,
  },
  {
    platform: "github",
    label: "GitHub",
    url: null,
    handle: null,
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    url: null,
    handle: null,
  },
  {
    platform: "youtube",
    label: "YouTube",
    url: null,
    handle: null,
  },
  {
    platform: "facebook",
    label: "Facebook",
    url: null,
    handle: null,
  },
];

export const configuredSocials = socialLinks.filter(
  (social): social is SocialLink & { url: string } => Boolean(social.url),
);
