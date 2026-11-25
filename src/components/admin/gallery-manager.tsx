"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { galleryCategories, galleryCategoryLabels } from "@/data/gallery";
import { formatDate } from "@/lib/utils";

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
  is_placeholder: boolean;
  published: boolean;
  sort_order: number | null;
  created_at: string;
}

interface FormState {
  caption: string;
  altText: string;
  category: string;
  takenOn: string;
  sourceUrl: string;
  sourceLabel: string;
  published: boolean;
  imageUrl: string;
}

const EMPTY_FORM: FormState = {
  caption: "",
  altText: "",
  category: "Personal",
  takenOn: "",
  sourceUrl: "",
  sourceLabel: "",
  published: false,
  imageUrl: "",
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const BUCKET = "gallery";

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function imageDimensions(source: File | string): Promise<{ width: number; height: number }> {
  if (typeof source === "string") {
    return new Promise((resolve) => {
      const image = new Image();
      const timer = window.setTimeout(() => resolve({ width: 1200, height: 1500 }), 6000);
      image.onload = () => {
        window.clearTimeout(timer);
        resolve({
          width: image.naturalWidth || 1200,
          height: image.naturalHeight || 1500,
        });
      };
      image.onerror = () => {
        window.clearTimeout(timer);
        resolve({ width: 1200, height: 1500 });
      };
      image.src = source;
    });
  }

  try {
    const bitmap = await createImageBitmap(source);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 1200, height: 1500 };
  }
}

function storagePath(url: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

export function GalleryManager({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("gallery_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as GalleryRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      const { data, error: loadError } = await supabase
        .from("gallery_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (loadError) {
        setError(loadError.message);
      } else {
        setRows((data ?? []) as GalleryRow[]);
      }
      setLoading(false);
    }

    void loadInitial();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  function updateForm(field: keyof FormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFile(null);
    setFilePreview(null);
    setEditingId(null);
    setFileInputKey((key) => key + 1);
  }

  function startEdit(row: GalleryRow) {
    setEditingId(row.id);
    setForm({
      caption: row.caption ?? "",
      altText: row.alt_text ?? "",
      category: row.category ?? "Personal",
      takenOn: row.taken_on ?? "",
      sourceUrl: row.source_url ?? "",
      sourceLabel: row.source_label ?? "",
      published: row.published,
      imageUrl: row.image_url,
    });
    setFile(null);
    setFilePreview(null);
    setError(null);
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleFile(selected: File | null) {
    setError(null);
    setNotice(null);
    if (!selected) {
      setFile(null);
      setFilePreview(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError("Gunakan gambar JPEG, PNG, WebP, AVIF, atau GIF.");
      setFile(null);
      setFilePreview(null);
      setFileInputKey((key) => key + 1);
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("Ukuran gambar harus 8 MB atau lebih kecil.");
      setFile(null);
      setFilePreview(null);
      setFileInputKey((key) => key + 1);
      return;
    }
    setFile(selected);
    setFilePreview(URL.createObjectURL(selected));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const caption = form.caption.trim();
    if (caption.length < 2 || caption.length > 180) {
      setError("Tambahkan keterangan antara 2 dan 180 karakter.");
      return;
    }
    if (!editingId && !file && !form.imageUrl.trim()) {
      setError("Pilih file gambar atau masukkan URL gambar HTTPS yang Anda miliki atau boleh digunakan.");
      return;
    }
    if (form.imageUrl.trim() && !isHttpsUrl(form.imageUrl.trim())) {
      setError("URL gambar harus berupa alamat HTTPS yang valid.");
      return;
    }
    if (form.sourceUrl.trim() && !isHttpsUrl(form.sourceUrl.trim())) {
      setError("Tautan sumber harus berupa alamat HTTPS yang valid.");
      return;
    }

    setBusy(true);
    try {
      if (editingId) {
        const payload = {
          caption,
          alt_text: form.altText.trim() || caption,
          category: form.category,
          taken_on: form.takenOn || null,
          source_url: form.sourceUrl.trim() || null,
          source_label: form.sourceLabel.trim() || null,
          published: form.published,
        };
        const { error: updateError } = await supabase
          .from("gallery_items")
          .update(payload)
          .eq("id", editingId)
          .select("id")
          .single();
        if (updateError) throw updateError;
        setNotice("Item galeri diperbarui.");
        resetForm();
        await loadRows();
        return;
      }

      let imageUrl = form.imageUrl.trim();
      let uploadedPath: string | null = null;

      if (file) {
        const extension =
          (file.name.split(".").pop() ?? "jpg")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 5) || "jpg";
        const unique =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const date = new Date().toISOString().slice(0, 10);
        uploadedPath = `uploads/${date}/${unique}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(uploadedPath, file, {
            cacheControl: "31536000",
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadedPath);
        imageUrl = publicUrlData.publicUrl;
      }

      const size = await imageDimensions(file ?? imageUrl);

      const { error: insertError } = await supabase
        .from("gallery_items")
        .insert({
          image_url: imageUrl,
          caption,
          alt_text: form.altText.trim() || caption,
          category: form.category,
          taken_on: form.takenOn || null,
          source_url: form.sourceUrl.trim() || null,
          source_label: form.sourceLabel.trim() || null,
          width: size.width,
          height: size.height,
          is_placeholder: false,
          published: form.published,
          sort_order: rows.length,
        })
        .select("id")
        .single();

      if (insertError) {
        if (uploadedPath) {
          await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => undefined);
        }
        throw insertError;
      }

      setNotice(
        form.published
          ? "Gambar diterbitkan. Galeri publik diperbarui dalam sekitar satu menit."
          : "Gambar disimpan sebagai draf.",
      );
      resetForm();
      await loadRows();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Item galeri tidak dapat disimpan.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(row: GalleryRow) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: updateError } = await supabase
      .from("gallery_items")
      .update({ published: !row.published })
      .eq("id", row.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, published: !item.published } : item,
        ),
      );
      setNotice(!row.published ? "Gambar diterbitkan." : "Gambar dipindahkan ke draf.");
    }
    setBusy(false);
  }

  async function remove(row: GalleryRow) {
    const confirmed = window.confirm(
      `Hapus “${row.caption ?? "gambar ini"}”? Ini akan menghapus entri galeri dan file unggahan jika file itu milik bucket ini.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: deleteError } = await supabase
      .from("gallery_items")
      .delete()
      .eq("id", row.id);

    if (deleteError) {
      setError(deleteError.message);
      setBusy(false);
      return;
    }

    const path = storagePath(row.image_url);
    if (path) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
      if (storageError) {
        console.warn("Baris galeri dihapus tetapi file penyimpanan tidak dapat dihapus.", storageError);
      }
    }

    setNotice("Item galeri dihapus.");
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (editingId === row.id) resetForm();
    setBusy(false);
  }

  const publishedCount = rows.filter((row) => row.published).length;

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <div ref={formRef} className="xl:sticky xl:top-28 xl:self-start">
        <div className="rounded-2xl border border-line bg-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
            <div>
              <p className="eyebrow">{editingId ? "Ubah item" : "Item baru"}</p>
              <h2 className="mt-2 text-xl font-medium tracking-[-0.03em]">
                {editingId ? "Perbarui detail gambar" : "Tambahkan ke galeri"}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[10px] text-muted transition-colors hover:text-ink"
              >
                <X className="h-3 w-3" />
                Batal
              </button>
            )}
          </div>

          <form onSubmit={submit} className="mt-5">
            {!editingId && (
              <>
                <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  File gambar
                </label>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="gallery-file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong px-4 py-2.5 text-xs text-ink transition-colors hover:border-accent hover:bg-accent/10"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-accent" />
                    Pilih gambar
                  </label>
                  <input
                    key={fileInputKey}
                    id="gallery-file"
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  <span className="min-w-0 truncate text-[10px] text-muted">
                    {file ? file.name : "JPEG, PNG, WebP, AVIF, GIF · maks 8 MB"}
                  </span>
                </div>

                {(filePreview || (form.imageUrl && isHttpsUrl(form.imageUrl))) && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Local file previews and arbitrary imported URLs are not known to next/image at build time. */}
                    <img
                      src={filePreview ?? form.imageUrl}
                      alt="Pratinjau gambar terpilih"
                      className="max-h-48 w-full object-cover"
                    />
                  </div>
                )}

                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                    atau gunakan URL gambar
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <label htmlFor="gallery-url" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  URL gambar
                </label>
                <input
                  id="gallery-url"
                  type="url"
                  value={form.imageUrl}
                  onChange={(event) => updateForm("imageUrl", event.target.value)}
                  placeholder="https://…"
                  className="field"
                  disabled={Boolean(file)}
                />
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                  Gunakan hanya URL gambar yang Anda miliki atau sudah mendapat izin jelas untuk menerbitkannya.
                </p>
              </>
            )}

            {editingId && (
              <div className="overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- Editing can point at any imported image host. */}
                <img
                  src={form.imageUrl}
                  alt="Gambar galeri saat ini"
                  className="max-h-40 w-full object-cover"
                />
              </div>
            )}

            <div className="mt-5">
              <label htmlFor="gallery-caption" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                Keterangan <span className="text-accent">*</span>
              </label>
              <input
                id="gallery-caption"
                type="text"
                maxLength={180}
                value={form.caption}
                onChange={(event) => updateForm("caption", event.target.value)}
                className="field"
                placeholder="Apa yang terjadi dalam gambar ini?"
                required
              />
            </div>

            <div className="mt-4">
              <label htmlFor="gallery-alt" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                Teks alternatif
              </label>
              <input
                id="gallery-alt"
                type="text"
                maxLength={240}
                value={form.altText}
                onChange={(event) => updateForm("altText", event.target.value)}
                className="field"
                placeholder="Deskripsi aksesibel (default: keterangan)"
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gallery-category" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  Kategori
                </label>
                <select
                  id="gallery-category"
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  className="field appearance-none"
                >
                  {galleryCategories.map((category) => (
                    <option key={category} value={category}>
                      {galleryCategoryLabels[category]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gallery-date" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  Tanggal
                </label>
                <input
                  id="gallery-date"
                  type="date"
                  value={form.takenOn}
                  onChange={(event) => updateForm("takenOn", event.target.value)}
                  className="field"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gallery-source" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  Tautan sumber
                </label>
                <input
                  id="gallery-source"
                  type="url"
                  value={form.sourceUrl}
                  onChange={(event) => updateForm("sourceUrl", event.target.value)}
                  className="field"
                  placeholder="https://instagram.com/p/…"
                />
              </div>
              <div>
                <label htmlFor="gallery-source-label" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  Label sumber
                </label>
                <input
                  id="gallery-source-label"
                  type="text"
                  maxLength={80}
                  value={form.sourceLabel}
                  onChange={(event) => updateForm("sourceLabel", event.target.value)}
                  className="field"
                  placeholder="Pos Instagram"
                />
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-bg/40 px-3.5 py-3">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(event) => updateForm("published", event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-xs text-muted">
                Terbitkan langsung
                <span className="ml-1 text-muted">(jika tidak, disimpan sebagai draf)</span>
              </span>
            </label>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-success">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-[var(--invert)] transition-colors hover:bg-accent hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {editingId ? "Simpan perubahan" : "Tambahkan ke galeri"}
                </>
              )}
            </button>
          </form>

          <p className="mt-4 border-t border-line pt-4 text-[10px] leading-relaxed text-muted">
            Unggahan divalidasi, disimpan di bucket <code>gallery</code> yang dapat dibaca publik,
            dan dilindungi oleh keamanan tingkat baris Supabase. Perubahan publik muncul dalam
            sekitar satu menit.
          </p>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="eyebrow">Koleksi</p>
            <p className="mt-1 text-sm text-ink">
              {loading ? "Memuat…" : `${rows.length} item · ${publishedCount} terbit`}
            </p>
          </div>
          <button
            type="button"
            onClick={loadRows}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </button>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="flex animate-pulse items-center gap-4 rounded-xl border border-line bg-card p-3"
              >
                <div className="h-20 w-24 rounded-lg bg-surface" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-surface" />
                  <div className="h-2 w-1/3 rounded bg-surface" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line p-10 text-center">
            <ImagePlus className="mx-auto h-6 w-6 text-muted/40" strokeWidth={1.4} />
            <p className="mt-3 text-sm text-ink">Galeri masih kosong.</p>
            <p className="mt-1 text-xs text-muted">
              Tambahkan gambar pertama lewat formulir. Gambar akan tetap menjadi draf sampai
              Anda menerbitkannya.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-4 rounded-xl border border-line bg-card p-3 transition-colors hover:border-line-strong"
              >
                <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Admin rows can reference imported images from any host. */}
                  <img
                    src={row.image_url}
                    alt=""
                    width={row.width ?? 1200}
                    height={row.height ?? 1500}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[7px] uppercase tracking-[0.1em] text-muted">
                      {galleryCategoryLabels[(row.category ?? "Personal") as keyof typeof galleryCategoryLabels] ??
                        row.category ??
                        "—"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[7px] uppercase tracking-[0.1em] ${
                        row.published
                          ? "border border-emerald-500/25 bg-emerald-500/[0.08] text-success"
                          : "border border-amber-500/25 bg-amber-500/[0.08] text-warning"
                      }`}
                    >
                      {row.published ? "Terbit" : "Draf"}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs font-medium text-ink">
                    {row.caption ?? "Gambar tanpa judul"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(row.taken_on) ?? "Tanpa tanggal"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[9px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      Ubah
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => togglePublished(row)}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[9px] text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
                    >
                      {row.published ? (
                        <>
                          <EyeOff className="h-2.5 w-2.5" />
                          Tarik dari publik
                        </>
                      ) : (
                        <>
                          <Eye className="h-2.5 w-2.5" />
                          Terbitkan
                        </>
                      )}
                    </button>
                    <a
                      href={row.image_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[9px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Gambar
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(row)}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[9px] text-muted transition-colors hover:border-red-500/40 hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[10px] leading-relaxed text-muted">
          Menghapus item akan menghapus baris basis data dan mencoba menghapus file unggahan.
          URL gambar eksternal tidak pernah dihapus dari sumbernya. Gunakan galeri publik untuk
          memeriksa apa yang dilihat pengunjung.
        </p>
      </div>
    </div>
  );
}
