# Konfigurasi picoCTF / picoGym

Panduan ini menyiapkan solver lokal untuk latihan picoCTF/picoGym tanpa
mengubah kemampuan solver yang sudah ada. Tidak ada API picoCTF baru yang
ditebak: integrasi tetap memakai halaman publik resmi `https://play.picoctf.org`
dan CTFd REST resmi bila token diberikan operator.

## 1. Prasyarat

- Node.js 22+, Docker Desktop berjalan, image `ctf-kali-remote:latest` tersedia.
- Server Next dijalankan lewat custom server agar WebSocket terminal aktif:
  `npm.cmd start -- --port 3130`.
- Backend Python opsional di `3131` untuk analisis artefak tambahan.

## 2. Menjalankan setup

Dari root proyek:

```powershell
# Belum punya instance? Init dengan allowlist kosong (= semua endpoint ditolak).
npm run ctf:picoctf:configure

# Setelah operator memberikan host/port instance picoGym miliknya:
npm run ctf:picoctf:configure -- -AllowedHosts "satanic.picoctf.net" -AllowedPorts "58246"
```

Skrip membuat `C:\CTF-AI\challenges`, `C:\CTF-AI\evidence`, dan
`C:\CTF-AI\reports`, lalu menulis kunci non-secret berikut ke `.env.local`:

```text
CTF_WORKSPACE_ROOT=C:\CTF-AI
CTF_PICOCTF_MODE=1
CTF_PICOCTF_STRICT_ENDPOINTS=1
CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION=1
CTF_PICOCTF_ALLOWED_HOSTS=...
CTF_PICOCTF_ALLOWED_PORTS=...
```

Skrip tidak pernah mencetak isi `.env.local` dan tidak menyimpan token, Cookie,
password, atau kredensial browser. Isi allowlist harus berasal dari operator,
bukan dari writeup publik, hasil pencarian, atau konten halaman yang tidak
tepercaya.

Restart server setelah konfigurasi berubah. Kunci dibaca saat modul dimuat,
jadi restart wajib agar aturan baru aktif.

## 3. Workspace per challenge

Setiap challenge mendapat direktori sendiri:

```text
C:\CTF-AI\challenges\<judul-slug>-<hash-pendek>\
  attachments\   artefak hasil unggah/import
  analysis\      salinan read-only untuk mount Kali /analysis
  evidence\      bukti analisis
  reports\       laporan akhir
  workspace.json identitas challenge + catatan keamanan
```

Hash pendek diakhiri nama direktori untuk mencegah tabrakan dan path traversal.
File yang diunggah sebelum konfigurasi ini masih dibaca dari `.data/uploads`
lewat fallback; file baru memakai workspace root.

## 4. Kategori yang dikenali

| Label picoCTF | Kategori internal solver |
| --- | --- |
| Cryptography | `cryptography` |
| Forensics | `digital-forensics` |
| General Skills | `miscellaneous` |
| Reverse Engineering | `reverse-engineering` |
| Web Exploitation | `web-security` |
| Binary Exploitation | `binary-exploitation` |

Label kategori yang tertulis di deskripsi/soal dipakai sebagai bukti nyata
klasifikasi, bukan sebagai dugaan. Field yang tidak ada tetap dilaporkan di
`missingInformation`.

## 5. Aturan jaringan

- `CTF_PICOCTF_STRICT_ENDPOINTS=1` adalah default. Jika
  `CTF_PICOCTF_ALLOWED_HOSTS` kosong, semua endpoint remote ditolak. Ini sengaja
  aman sampai operator menentukan instance yang benar-benar ia miliki.
- Host dicocokkan persis; wildcard `*.domain` didukung. Port juga harus
  terdaftar bila `CTF_PICOCTF_ALLOWED_PORTS` diisi.
- Untuk instance CyLab Academy, operator dapat menambahkan
  `xebec.cylabacademy.net` dan/atau `chatelaine.cylabacademy.net` beserta port
  yang sedang dipakai. Contoh port yang sudah diizinkan di mesin ini: `42021`
  dan `33218`.
- `learn.cylabacademy.org` dibaca sebagai sumber riset publik melalui jalur
  `safeFetch`. API detail challenge di sana memerlukan sesi operator; sistem
  tidak melakukan login otomatis, CAPTCHA bypass, atau pembacaan token dari
  environment. Jika detail challenge tidak dapat diakses, solver tetap
  melanjutkan dari banner/output terminal Kali secara bertahap.
- `CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION=1` adalah default. Di `/ctf/solver`
  ada checkbox **Izinkan aksi jaringan untuk instance challenge milik saya**.
  Centang hanya untuk pesan yang akan dijalankan; statusnya direset setelah
  pesan selesai.
- Perintah `nc`, `ncat`, `curl`, `wget`, `ssh`, `git`, `nmap`, dan pola
  socket/HTTP di Python/Node ditunda tanpa konfirmasi ini. Gate ini mengikat
  aksi yang dihasilkan solver di `/ctf/solver`; terminal Kali manual tetap
  merupakan alat eksplisit yang dijalankan operator.
- Jalur platform adapter tetap membatasi origin resmi. Token/Cookie sesi hanya
  dikirim dari request operator ke origin resmi dan tidak disimpan.
- Tidak ada login otomatis, CAPTCHA bypass, akses host di luar allowlist, atau
  brute-force jaringan. Submit jawaban eksternal tetap hanya jika
  `allowSubmission: true` dan ada verification record `confirmed: true` untuk
  kandidat yang sama.

## 6. Verifikasi

```powershell
npm run ctf:picoctf:verify
npm run typecheck
npm run lint
npm run ctf:smoke
npm run ctf:reasoning:smoke
npm run ctf:autonomous:smoke
npm run ctf:autonomous:acceptance
npm run ctf:sidecars:verify
npm run build
```

`ctf:picoctf:verify` menguji deteksi 6 kategori, workspace terpisah, fallback
file lama, penolakan traversal, penolakan host/port yang tidak terdaftar, dan
deteksi perintah jaringan. Ia memakai direktori sementara dan membersihkannya
sendiri.

Flag hanya dilaporkan jika perintah berhasil dan output memuat penanda selesai
server diikuti flag itu, atau cocok dengan `expectedFlag`. Kosakata status:
`VERIFIED`/`CONFIRMED`, `HIGH CONFIDENCE`, `PROBABLE`, `UNVERIFIED`, `REJECTED`.
`POTENTIAL` tidak pernah dipromosikan menjadi flag terverifikasi.

## 7. Batasan

Belum ada host/port instance picoGym yang diberikan operator, jadi tidak ada
challenge picoCTF yang bisa diakses atau diselesaikan saat ini. Writeup publik
bukan oracle; konflik informasi tidak boleh dianggap sebagai verifikasi.
Halaman library picoCTF yang dilindungi Cloudflare juga tidak dibypass.
