export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "github"
  | "linkedin";

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  url: string | null;
  handle: string | null;
}

export type GalleryCategory =
  | "Personal"
  | "Technology"
  | "Campus"
  | "Activities"
  | "Achievements"
  | "Projects"
  | "Photography";

export interface GalleryItem {
  id: string;
  src: string;
  alt: string;
  caption: string;
  category: GalleryCategory;
  date: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  width: number;
  height: number;
  isPlaceholder: boolean;
}

export type ProjectArtwork =
  | "intelligence"
  | "heritage"
  | "code"
  | "database";

export interface ProjectFact {
  label: string;
  value: string;
}

export interface Project {
  slug: string;
  index: string;
  title: string;
  subtitle: string;
  description: string;
  intro: string;
  role: string;
  status: string;
  topics: string[];
  facts: ProjectFact[];
  sections: { heading: string; body: string[] }[];
  links: {
    github: string | null;
    demo: string | null;
  };
  artwork: ProjectArtwork;
  accent: string;
}

export type AchievementType =
  | "award"
  | "participation"
  | "certification"
  | "rank"
  | "game";

export interface AchievementMedia {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface GameTrophy extends AchievementMedia {
  team: string;
}

export interface Achievement {
  id: string;
  title: string;
  result: string;
  resultNote: string;
  badge: string;
  type: AchievementType;
  description: string;
  details: string[];
  date: string | null;
  certificateUrl: string | null;
  image: AchievementMedia | null;
  imageFit?: "cover" | "contain";
  trophies?: GameTrophy[];
}

export interface Experience {
  id: string;
  company: string;
  role: string;
  type: string;
  summary: string;
  highlights: string[];
  tools: string[];
}

export type SkillCategoryId =
  | "programming"
  | "cybersecurity"
  | "networking"
  | "technology";

export interface SkillCategory {
  id: SkillCategoryId;
  label: string;
  kicker: string;
  description: string;
  skills: string[];
}

export interface Education {
  id: string;
  institution: string;
  shortName: string;
  program: string;
  level: string;
  description: string;
  coursework: string[];
  period: string | null;
}

export interface NavItem {
  label: string;
  href: string;
  id: string;
}
