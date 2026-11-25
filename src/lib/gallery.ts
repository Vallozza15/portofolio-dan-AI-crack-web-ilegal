import { createClient } from "@supabase/supabase-js";
import { localGallery, galleryCategories } from "@/data/gallery";
import type { GalleryCategory, GalleryItem } from "@/types";

export const GALLERY_BUCKET = "gallery";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

interface GalleryRow {
  id: string;
  image_url: string;
  caption: string | null;
  alt_text: string | null;
  category: string | null;
  taken_on: string | null;
  source_url: string | null;
  source_label: string | null;
  width: number | null;
  height: number | null;
  is_placeholder: boolean | null;
}

function safeCategory(value: string | null): GalleryCategory {
  if (value && galleryCategories.includes(value as GalleryCategory)) {
    return value as GalleryCategory;
  }
  return "Personal";
}

function mapRow(row: GalleryRow): GalleryItem {
  return {
    id: row.id,
    src: row.image_url,
    alt: row.alt_text || row.caption || "Gambar galeri",
    caption: row.caption || "Gambar tanpa judul",
    category: safeCategory(row.category),
    date: row.taken_on,
    sourceUrl: row.source_url,
    sourceLabel: row.source_label,
    width: row.width ?? 1200,
    height: row.height ?? 1500,
    isPlaceholder: Boolean(row.is_placeholder),
  };
}

/**
 * Read published gallery rows when Supabase is configured. If the service is
 * unavailable, the public site keeps working with the curated local archive.
 */
export async function getGalleryItems(): Promise<{
  items: GalleryItem[];
  source: "supabase" | "local";
}> {
  if (!isSupabaseConfigured()) {
    return { items: localGallery, source: "local" };
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await supabase
      .from("gallery_items")
      .select(
        "id, image_url, caption, alt_text, category, taken_on, source_url, source_label, width, height, is_placeholder",
      )
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      return { items: localGallery, source: "local" };
    }

    return { items: (data as GalleryRow[]).map(mapRow), source: "supabase" };
  } catch (error) {
    console.error("Gallery fetch failed; using the local archive.", error);
    return { items: localGallery, source: "local" };
  }
}
