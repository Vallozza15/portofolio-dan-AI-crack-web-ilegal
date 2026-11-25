/**
 * Prefix aset statis saat situs dipublish di subpath (GitHub Pages).
 * Isi NEXT_PUBLIC_BASE_PATH hanya pada build statis, mis.
 * NEXT_PUBLIC_BASE_PATH=/portofolio-dan-AI-crack-web-ilegal.
 * Pada aplikasi server normal nilai ini kosong sehingga path tetap "/...".
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function asset(path: string) {
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
