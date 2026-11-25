# Vallozza Portfolio + CTF Intelligence

Website portofolio pribadi **Muhammad Vallozza Vito** yang juga menyertakan
**CTF Intelligence**, yaitu dashboard dan solver AI untuk latihan keamanan siber
yang diotorisasi.

Repositori ini adalah paket deployment yang sudah dibersihkan dari data lokal,
kredensial, `node_modules`, cache, dan build sementara. Proyek asli tidak
diubah oleh proses pembersihan ini.

## Fitur utama

### Portofolio

- Landing page responsif dengan tema gelap.
- Tombol bulat **AI CTF** di kanan bawah, tersedia di halaman React dan versi statis `/portfolio.html`.
- Arsip proyek dan halaman detail per proyek.
- Galeri dengan Supabase (opsional).
- Formulir kontak melalui Resend (opsional).
- Halaman admin/galeri privat bila Supabase dikonfigurasi.
- Metadata SEO, Open Graph, sitemap, robots, dan manifest.
- Versi HTML statis di `/portfolio.html`.

### CTF Intelligence

- Dashboard challenge, sesi, laporan, dan verifikasi.
- Workspace per challenge untuk artefak.
- Lab crypto, forensics, stego, web, reverse, binary, dan OSINT.
- Chat AI dengan mode learning, expert, dan hint.
- Research engine untuk mencari writeup publik dan mengutip sumber asli.
- Solver otonom dengan terminal Kali (membutuhkan Docker).
- PicoGym/CyLab endpoint allowlist dan konfirmasi jaringan per pesan.
- PostgreSQL atau JSON store lokal.
- Python/FastAPI sidecar opsional untuk analisis artefak terbatas.
- Autentikasi akses CTF dengan password.

## Teknologi

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Framer Motion + Lucide
- Custom Node server (`server.ts`) + WebSocket (`ws`)
- PostgreSQL 16 (opsional; JSON store tetap tersedia)
- Python 3.12 + FastAPI + Uvicorn (sidecar opsional)
- Docker/Kali untuk terminal CTF (opsional)
- Supabase dan Resend (opsional)

## Kebutuhan

- Node.js **22** (minimum proyek: 20.9)
- npm 10+
- Python 3.12+ hanya jika ingin sidecar analisis
- PostgreSQL 16 hanya jika ingin penyimpanan database
- Docker Desktop / Docker Engine hanya jika ingin terminal Kali

## Mulai cepat (mode minimal, tanpa Docker/Postgres)

```bash
git clone <URL_REPOSITORI_ANDA>
cd <NAMA_REPOSITORI>
npm ci
cp .env.example .env.local
npm run dev
```

Buka `http://localhost:3000`.

Tanpa variabel tambahan, website portofolio tetap berjalan. Fitur yang belum
dikonfigurasi akan menampilkan status "belum dikonfigurasi", bukan data palsu.

## Mode lengkap (PostgreSQL + Python + Docker)

### Windows

```powershell
Copy-Item .env.example .env.local
# isi password, database URL, dan konfigurasi lain di .env.local
npm run ctf:start
```

Skrip `ctf:start` menjalankan Docker, PostgreSQL portable, llama.cpp lokal,
Python backend, dan server Next.js. Tambahkan `-NoTunnel` jika tidak ingin
Cloudflare Quick Tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ctf-start-all.ps1 -NoTunnel
```

### Linux / Docker Compose

```bash
cp .env.example .env
# ubah POSTGRES_PASSWORD, CTF_ACCESS_PASSWORD, CTF_MASTER_KEY, dan URL publik
docker compose up -d --build
```

Untuk mengaktifkan terminal Kali di VPS Linux yang Anda kontrol sendiri:

```bash
docker build -t ctf-kali-remote:latest docker/ctf-kali-remote
docker compose -f docker-compose.yml -f docker-compose.kali.yml up -d --build
```

> **Peringatan:** mount Docker socket memberi aplikasi kontrol atas Docker
> host. Jangan aktifkan pada host bersama atau yang tidak dipercaya.

## Variabel environment

Salin `.env.example` menjadi `.env.local` (lokal) atau `.env` (Compose), lalu
isi nilainya. Jangan pernah commit file environment yang berisi rahasia.

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Produksi | URL publik portofolio, mis. `https://portfolio.example.com`. Nilai ini di-inline saat build. |
| `NEXT_PUBLIC_CTF_URL` | Opsional | Origin CTF jika berbeda dari portofolio. Kosongkan jika satu origin. |
| `HOST` / `PORT` | Tidak | Bind address dan port server; default `0.0.0.0:3000`. Jangan memakai `HOSTNAME` Docker. |
| `CTF_ACCESS_PASSWORD` | Produksi | Wajib diisi sebelum mempublikasikan `/ctf`. |
| `CTF_MASTER_KEY` | Produksi | Kunci enkripsi API key provider, minimal 16 karakter. |
| `CTF_DATABASE_URL` | Opsional | Jika kosong, data disimpan di JSON `.data`. |
| `CTF_PY_BACKEND_URL` | Opsional | Default `http://127.0.0.1:3131`; di Compose `http://py:3131`. |
| `CTF_WORKSPACE_ROOT` | Opsional | Root workspace artefak; default `C:\CTF-AI` di Windows atau `/data/ctf` di container. |
| `POSTGRES_PASSWORD` | Compose | Password PostgreSQL untuk `docker-compose.yml`. |
| `APP_PORT` | Compose | Port host untuk aplikasi; default `3000`. |

Variabel picoGym/CyLab, AI provider, sandbox, dan batas eksekusi dijelaskan
langsung di `.env.example`.

## Perintah penting

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm start
npm run ctf:smoke
npm run ctf:autonomous:smoke
npm run ctf:research:smoke
npm run ctf:picoctf:verify
```

## Deployment

Panduan lengkap ada di [DEPLOYMENT.md](DEPLOYMENT.md). Ringkasnya:

- **GitHub Pages tidak cocok** untuk seluruh aplikasi karena ada API routes,
  autentikasi, database, dan WebSocket.
- **Vercel** dapat dipakai untuk portofolio statis, tetapi bukan untuk custom
  server + WebSocket + terminal Docker tanpa arsitektur terpisah.
- **VPS dengan Docker Compose** adalah opsi paling lengkap dan direkomendasikan
  untuk seluruh fitur.
- **Render/Railway/Fly.io** dapat menjalankan container web + PostgreSQL, tetapi
  terminal Kali memerlukan Docker host terpisah atau VPS.

Jika memakai versi statis `/portfolio.html` dan AI CTF dihosting di origin
terpisah, isi atribut `data-ctf-url` pada tombol `#ctfFab` di
`public/portfolio.html` dengan origin CTF, misalnya
`data-ctf-url="https://ctf.example.com"`.

## Struktur proyek

```text
.
├── backend/                 # FastAPI sidecar
├── docker/                  # image Kali, sandbox, fixture SSH
├── docs/                    # dokumentasi teknis
├── public/                  # aset statis
├── scripts/                 # helper Windows/Node
├── src/
│   ├── app/                 # route Next.js + API
│   ├── components/          # UI
│   ├── data/                # data portofolio
│   └── lib/                 # domain logic CTF
├── supabase/schema.sql      # skema galeri Supabase
├── Dockerfile               # image web app
├── docker-compose.yml       # web + PostgreSQL + Python
└── server.ts                # custom server + WebSocket
```

## Keamanan

- Jangan commit `.env`, `.env.local`, `.data`, upload, laporan challenge, atau
  kunci API.
- Isi `CTF_ACCESS_PASSWORD` sebelum membuka `/ctf` ke internet.
- Gunakan HTTPS dan cookie aman di produksi.
- Terminal dan sandbox bersifat sensitif; jalankan hanya di host yang Anda
  kontrol dan dengan allowlist endpoint.
- Halaman web dan output tool diperlakukan sebagai data tidak tepercaya.

## Lisensi

MIT. Lihat [LICENSE](LICENSE).
