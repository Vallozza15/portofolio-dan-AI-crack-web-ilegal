"use client";

import { useState } from "react";
import { Database, HardDrive, Loader2, Save, ShieldAlert, Trash2 } from "lucide-react";
import { Badge, ErrorBanner, Field, PageHeader, Panel, Toggle } from "./ui";
import { formatBytes } from "@/lib/ctf/format";
import type { PublicSettings } from "@/lib/ctf/settings";

export function SystemSettingsView({
  settings,
  storage,
}: {
  settings: PublicSettings;
  storage: { dataDir: string; files: number; bytes: number; challenges: number; sessions: number; reports: number };
}) {
  const [system, setSystem] = useState(settings.system);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ctf/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system }),
      });
      const payload = (await response.json()) as { settings?: PublicSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error || "Gagal menyimpan.");
      setSystem(payload.settings.system);
      setMessage("Pengaturan sistem disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="SYSTEM SETTINGS"
        title="Runtime, uploads & execution policy"
        description="Kontrol bahasa default, batas upload, akses jaringan privat, host tools, dan sandbox. Perubahan dicatat pada audit log."
        actions={
          <button type="button" className="ctf-btn ctf-btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Simpan
          </button>
        }
      />

      {(error || message) && (
        <div className="mb-4 space-y-2">
          <ErrorBanner message={error} />
          {message && (
            <div className="rounded-lg border border-[rgba(52,211,153,0.3)] bg-[rgba(6,78,59,0.18)] px-3 py-2 text-[11.5px] text-[#a7f3d0]">
              {message}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="Preferensi umum">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bahasa default">
                <select
                  className="ctf-select"
                  value={system.defaultLanguage}
                  onChange={(event) => setSystem({ ...system, defaultLanguage: event.target.value as "id" | "en" })}
                >
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="Batas upload (MB)" hint="Berlaku pada validasi server, bukan hanya UI.">
                <input
                  className="ctf-input ctf-mono"
                  type="number"
                  min={1}
                  max={200}
                  value={system.maxUploadMb}
                  onChange={(event) => setSystem({ ...system, maxUploadMb: Number(event.target.value) })}
                />
              </Field>
              <Field label="Retensi data (hari)" hint="Catatan kebijakan; pembersihan otomatis belum dijadwalkan.">
                <input
                  className="ctf-input ctf-mono"
                  type="number"
                  min={1}
                  max={3650}
                  value={system.retainDays}
                  onChange={(event) => setSystem({ ...system, retainDays: Number(event.target.value) })}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Kebijakan eksekusi" subtitle="Perubahan langsung memengaruhi kemampuan analisis.">
            <div className="space-y-2">
              <Toggle
                checked={system.allowPrivateHttp}
                onChange={(value) => setSystem({ ...system, allowPrivateHttp: value })}
                label="Izinkan HTTP ke jaringan privat"
                description="Mematikan proteksi SSRF. Hanya untuk lab lokal yang Anda kontrol."
                danger
              />
              <Toggle
                checked={system.hostToolsEnabled}
                onChange={(value) => setSystem({ ...system, hostToolsEnabled: value })}
                label="Aktifkan host tools"
                description="Menjalankan profil tool tetap (file, strings, readelf, dst.) pada file yang diunggah. Tidak ada shell bebas."
                danger
              />
              <Toggle
                checked={system.sandboxEnabled}
                onChange={(value) => setSystem({ ...system, sandboxEnabled: value })}
                label="Aktifkan Docker sandbox"
                description="Eksekusi terisolasi dengan network none, read-only, non-root, dan resource limit. Memerlukan Docker + image."
              />
            </div>
            <div className="mt-3 rounded-lg border border-[rgba(251,191,36,0.28)] bg-[rgba(69,45,5,0.15)] p-2.5 text-[10px] leading-relaxed text-[#fde68a]">
              <span className="flex items-center gap-1.5 font-medium"><ShieldAlert size={11} /> Peringatan</span>
              Mengaktifkan host tools atau akses jaringan privat mengurangi isolasi. Hanya lakukan pada mesin dan target yang Anda otorisasi.
            </div>
          </Panel>

          <Panel title="Zona berbahaya" subtitle="Penghapusan data operasional tidak dapat dibatalkan.">
            <button
              type="button"
              className="ctf-btn ctf-btn-danger"
              onClick={() => setError("Penghapusan data belum diaktifkan pada UI. Gunakan store.clearOperationalData melalui skrip terkontrol setelah backup.")}
            >
              <Trash2 size={13} /> Hapus semua data operasional
            </button>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Penyimpanan" subtitle="Lokal-first, atomic JSON store.">
            <div className="space-y-2 text-[10.5px]">
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Backend</span><Badge tone={settings.database.backend === "postgres" ? "green" : "cyan"}>{settings.database.backend === "postgres" ? "PostgreSQL" : "JSON lokal"}</Badge></div>
              {settings.database.backend === "postgres" && (
                <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Koneksi</span><span className={settings.database.reachable ? "text-[#6ee7b7]" : "text-[#fda4af]"}>{settings.database.reachable ? "aktif" : "gagal"}</span></div>
              )}
              {settings.database.serverVersion && (
                <div className="flex items-start justify-between gap-2"><span className="shrink-0 text-[var(--ctf-muted)]">Server</span><span className="ctf-mono truncate text-[9px] text-[#a7f3d0]">{settings.database.serverVersion.split(",")[0]}</span></div>
              )}
              {settings.database.error && (
                <div className="rounded border border-[rgba(244,63,94,0.3)] bg-[rgba(76,5,25,0.2)] p-2 text-[9.5px] text-[#fda4af]">{settings.database.error}</div>
              )}
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Data dir</span><span className="ctf-mono truncate text-[9.5px] text-[#a7f3d0]">{storage.dataDir}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">File</span><span className="ctf-mono text-[#a7f3d0]">{storage.files}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Ukuran upload</span><span className="ctf-mono text-[#a7f3d0]">{formatBytes(storage.bytes)}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Challenge</span><span className="ctf-mono text-[#a7f3d0]">{storage.challenges}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Sesi</span><span className="ctf-mono text-[#a7f3d0]">{storage.sessions}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--ctf-muted)]">Laporan</span><span className="ctf-mono text-[#a7f3d0]">{storage.reports}</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone={settings.database.backend === "postgres" ? "green" : "cyan"}><Database size={10} className="mr-1 inline" /> {settings.database.backend === "postgres" ? "PostgreSQL" : "JSON atomic"}</Badge>
              <Badge tone="violet"><HardDrive size={10} className="mr-1 inline" /> local uploads</Badge>
            </div>
            <p className="mt-2 text-[9.5px] leading-relaxed text-[var(--ctf-dim)]">
              {settings.database.backend === "postgres"
                ? "Data operasional tersimpan di PostgreSQL. Upload tetap di disk lokal."
                : "Set CTF_DATABASE_URL untuk memakai PostgreSQL. Lihat docs/CTF-INTELLIGENCE.md."}
            </p>
          </Panel>

          <Panel title="Keamanan runtime" noPadding>
            <div className="space-y-2 p-4 text-[10px] leading-relaxed text-[var(--ctf-muted)]">
              <div className="flex items-center justify-between"><span>Autentikasi</span><Badge tone={settings.authEnabled ? "green" : "amber"}>{settings.authEnabled ? "aktif" : "terbuka"}</Badge></div>
              <div className="flex items-center justify-between"><span>Master key env</span><Badge tone={settings.envMasterKey ? "green" : "amber"}>{settings.envMasterKey ? "set" : "file lokal"}</Badge></div>
              <p className="pt-1">Rate limit per-IP aktif pada semua endpoint tulis.</p>
              <p>Semua input divalidasi ukuran, tipe, dan isi.</p>
              <p>Audit log mencatat upload, tool run, perubahan settings, dan laporan.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
