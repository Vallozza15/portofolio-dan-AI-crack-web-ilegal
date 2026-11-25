# Deployment Guide

Dokumen ini menjelaskan cara mempublikasikan proyek secara nyata. Proyek ini
**bukan** situs statis: ada API routes, autentikasi, database opsional, custom
Node server, WebSocket, dan terminal Docker opsional.

## 1. Ringkasan arsitektur

```text
Browser
  │ HTTPS / WSS
  ▼
Reverse proxy (Caddy/Nginx)
  ▼
Next.js custom server :3000  ──► PostgreSQL :5432
  │                           └─► FastAPI sidecar :3131
  └─► Docker daemon (opsional, untuk terminal Kali)
```

Komponen wajib untuk semua fitur: web app, PostgreSQL (disarankan), Python
sidecar, dan Docker host. Tanpa Docker, fitur terminal Kali tidak berfungsi,
tetapi halaman portofolio dan fitur CTF non-terminal tetap dapat digunakan.

## 2. Pilihan hosting

| Platform | Portofolio | CTF + API | PostgreSQL | Terminal Kali | Catatan |
| --- | --- | --- | --- | --- | --- |
| VPS + Docker Compose | Ya | Ya | Ya | Ya | **Direkomendasikan** untuk fitur lengkap |
| Render/Railway/Fly.io | Ya | Ya | Ya (managed) | Tidak | Terminal butuh Docker host eksternal |
| Vercel | Ya | Sebagian | Ya (eksternal) | Tidak | Custom `server.ts` dan WebSocket tidak berjalan |
| GitHub Pages | Ya (statis) | Tidak | Tidak | Tidak | Hanya untuk ekspor statis portofolio |

Jangan memaksa GitHub Pages untuk seluruh aplikasi. GitHub Pages tidak
menjalankan Next.js API routes, autentikasi server, database, atau WebSocket.

## 3. Opsi GitHub Pages — portofolio statis (sedang aktif)

Alamat: https://vallozza15.github.io/portofolio-dan-AI-crack-web-ilegal/

Repositori ini disiapkan agar root `main` langsung menjadi situs Pages:

- `index.html` → halaman utama.
- `projects/` → empat halaman detail proyek.
- `portfolio.html` → versi HTML mandiri.
- `ctf/login/` → halaman informasi bahwa laboratorium penuh butuh server.
- `_next/`, `images/`, `fonts/`, `icons/` → aset statis.
- `.nojekyll` → mencegah Jekyll mengabaikan folder `_next/`.

Pengaturan GitHub: **Settings → Pages → Build and deployment → Deploy from a
branch → Branch `main`, folder `/ (root)`**. Workflow `.github/workflows/deploy.yml`
tetap menjalankan validasi build pada setiap push.

Yang **tidak** tersedia di Pages: `/api/*`, login CTF, dashboard, chat AI,
WebSocket terminal, sandbox Docker, dan penyimpanan data. Untuk itu pakai opsi
VPS di bawah. Tombol AI CTF di Pages sengaja diarahkan ke halaman informasi,
bukan ke dashboard yang tidak bisa berjalan.

Catatan untuk build aplikasi penuh dari repositori ini: aset yang semula ada di
`public/` sudah dipindahkan ke root agar Pages langsung menemukannya. Font
lokal dibaca dari `fonts/` (lihat `src/app/layout.tsx`). Jika ingin menjalankan
aplikasi server penuh, salin `images/`, `fonts/`, `icons/`, `portfolio.*`, dan
`llms.txt` ke folder `public/` sebelum `npm run build`, atau gunakan proyek asli
yang masih memiliki struktur `public/`.

## 4. Opsi A — VPS Linux dengan Docker Compose (disarankan)

### 3.1 Persyaratan VPS

- Ubuntu 22.04/24.04, RAM minimal 2 GB (4 GB lebih nyaman untuk build)
- Docker Engine + Docker Compose plugin
- Domain dan akses DNS
- Port 80/443 terbuka

### 3.2 Ambil proyek

```bash
git clone <URL_REPOSITORI_ANDA> vallozza
cd vallozza
```

### 3.3 Buat environment produksi

```bash
cp .env.example .env
openssl rand -base64 48   # gunakan untuk CTF_ACCESS_PASSWORD
openssl rand -base64 48   # gunakan untuk CTF_MASTER_KEY
openssl rand -base64 48   # gunakan untuk POSTGRES_PASSWORD
```

Isi `.env` minimal:

```dotenv
NEXT_PUBLIC_SITE_URL=https://portfolio.example.com
NEXT_PUBLIC_CTF_URL=
HOST=0.0.0.0
PORT=3000
APP_PORT=3000

CTF_ACCESS_PASSWORD=<password-panjang-acak>
CTF_MASTER_KEY=<kunci-panjang-acak>
POSTGRES_PASSWORD=<password-postgres-acak>

CTF_DATABASE_URL=postgres://ctf:<password-postgres-acak>@db:5432/ctf_intelligence
CTF_PY_BACKEND_URL=http://py:3131
CTF_WORKSPACE_ROOT=/data/ctf
CTF_TERMINAL_IMAGE=ctf-kali-remote:latest

# Untuk produksi publik, allowlist tetap harus eksplisit.
CTF_PICOCTF_MODE=1
CTF_PICOCTF_STRICT_ENDPOINTS=1
CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION=1
CTF_PICOCTF_ALLOWED_HOSTS=
CTF_PICOCTF_ALLOWED_PORTS=
```

Catatan: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CTF_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di-inline saat
build. Isi nilai Supabase di `.env` sebelum build bila memakai galeri; Compose
meneruskannya sebagai build arg. Gunakan **anon/publishable key**, bukan
service-role key. Jika URL berubah, build ulang image:

```bash
docker compose build --no-cache app
```

### 3.4 Jalankan stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Uji:

```bash
curl -I http://127.0.0.1:3000/
curl -I http://127.0.0.1:3000/ctf/login
```

### 3.5 Terminal Kali (opsional)

Di VPS yang khusus dan Anda kontrol sendiri:

```bash
docker build -t ctf-kali-remote:latest docker/ctf-kali-remote
docker compose -f docker-compose.yml -f docker-compose.kali.yml up -d --build
```

Ini me-mount `/var/run/docker.sock`. Itu berarti container aplikasi dapat
mengendalikan Docker host. Jangan lakukan pada host bersama. Jika tidak ingin
risiko ini, lewati langkah ini dan fitur terminal akan melaporkan bahwa Docker
tidak tersedia.

### 3.6 Reverse proxy + HTTPS

Contoh Caddy (paling sederhana, WebSocket otomatis):

```caddyfile
portfolio.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Contoh Nginx (perhatikan header Upgrade untuk WebSocket):

```nginx
server {
    listen 443 ssl http2;
    server_name portfolio.example.com;

    ssl_certificate     /etc/letsencrypt/live/portfolio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portfolio.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Pastikan `NEXT_PUBLIC_SITE_URL=https://portfolio.example.com` dan
`NEXT_PUBLIC_CTF_URL` kosong bila CTF memakai origin yang sama.

### 3.7 Backup

```bash
docker compose exec db pg_dump -U ctf ctf_intelligence > backup-$(date +%F).sql
docker run --rm -v vallozza_ctf-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/ctf-data-$(date +%F).tgz -C /data .
```

## 4. Opsi B — Render / Railway / Fly.io

Cocok jika Anda tidak ingin mengelola VPS. Batasannya: terminal Kali tidak bisa
menjalankan Docker di dalam container web biasa.

1. Buat PostgreSQL managed.
2. Deploy web app dari `Dockerfile` (port `3000`).
3. Deploy `backend/Dockerfile` sebagai service Python terpisah (port `3131`).
4. Set environment:
   - `NEXT_PUBLIC_SITE_URL=https://<domain-anda>`
   - `NEXT_PUBLIC_CTF_URL=`
   - `HOST=0.0.0.0`
   - `PORT=3000`
   - `CTF_DATABASE_URL=<connection string managed PostgreSQL>`
   - `CTF_PY_BACKEND_URL=https://<service-python-anda>`
   - `CTF_ACCESS_PASSWORD`, `CTF_MASTER_KEY`
5. Pastikan service Python hanya dapat diakses dari service web (private URL),
   bukan publik.
6. Terminal Kali akan menampilkan error Docker jika tidak ada Docker host.
   Untuk fitur penuh, tambahkan runner Docker terpisah atau pindah ke VPS.

## 5. Opsi C — Vercel (portofolio saja)

Vercel dapat menjalankan Next.js App Router, tetapi `server.ts` dan WebSocket
tidak dipakai. Artinya terminal CTF tidak akan berfungsi. Jika hanya ingin
portofolio:

1. Import repo ke Vercel.
2. Set `NEXT_PUBLIC_SITE_URL=https://<domain>`.
3. Set `NEXT_PUBLIC_CTF_URL=https://<domain-ctf-terpisah>`.
4. Deploy.

Untuk seluruh fitur CTF, gunakan Opsi A.

## 6. GitHub Actions

Workflow ada di `.github/workflows/deploy.yml` dan melakukan:

- `npm ci`
- typecheck
- lint
- smoke test CTF
- production build
- opsional memanggil deploy hook setelah build di branch `main`

Tambahkan secret berikut di **GitHub → Settings → Secrets and variables →
Actions**:

| Secret | Fungsi |
| --- | --- |
| `DEPLOY_HOOK_URL` | URL deploy hook Render/Railway/VPS. Jika kosong, workflow hanya validasi build. |

Jangan menulis token, password, atau connection string ke workflow.

## 7. Upload ke GitHub

Dari dalam direktori `GITHUB-DEPLOYMENT`:

```bash
git init
git add .
git commit -m "Initial public deployment package"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

Jangan jalankan `git add .` dari proyek asli jika `.env.local` atau `.data`
masih ada. Paket ini sudah memiliki `.gitignore` yang mengecualikan rahasia.

## 8. Checklist validasi setelah deploy

- [ ] `GET /` → 200
- [ ] `GET /projects` → 200
- [ ] `GET /ctf/login` → 200
- [ ] `GET /ctf` tanpa login → redirect ke login
- [ ] login CTF berhasil dan dashboard → 200
- [ ] `GET /api/ctf/dashboard` dengan cookie → 200
- [ ] tidak ada error 500 di log
- [ ] WebSocket terminal terhubung (jika Docker aktif)
- [ ] HTTPS aktif dan cookie memakai `Secure`
- [ ] `NEXT_PUBLIC_SITE_URL` bukan localhost
- [ ] tidak ada password/token di repo atau log

## 9. Troubleshooting

| Gejala | Penyebab umum | Solusi |
| --- | --- | --- |
| `ECONNREFUSED 5432` | `CTF_DATABASE_URL` salah / DB belum siap | Cek `docker compose ps`, healthcheck, dan host `db` |
| Halaman CTF terbuka tanpa login | `CTF_ACCESS_PASSWORD` kosong | Isi password lalu restart app |
| Terminal: Docker tidak merespons | Socket tidak di-mount / Docker mati | Jalankan Docker dan override `docker-compose.kali.yml` |
| Metadata/OG memakai localhost | Build memakai `NEXT_PUBLIC_SITE_URL` lama | Build ulang dengan URL produksi |
| WebSocket 400/401 | Cookie tidak terkirim / reverse proxy salah | Cek HTTPS, cookie, dan header `Upgrade` |
| Python 502 | Service `py` mati | `docker compose logs py`; cek `CTF_PY_BACKEND_URL` |

## 10. Catatan keamanan

- Password CTF dan master key wajib diganti sebelum publik.
- Jangan pernah commit `.env`, `.data`, laporan challenge, atau kunci API.
- Mount Docker socket adalah keputusan keamanan besar; gunakan VPS khusus.
- Endpoint challenge tetap memakai allowlist dan konfirmasi per pesan.
- Output tool dan halaman web adalah data tidak tepercaya, bukan instruksi.
