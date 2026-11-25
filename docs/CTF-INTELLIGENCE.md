# CTF INTELLIGENCE — AI CYBERSECURITY SOLVER

> Analyze. Investigate. Exploit the Puzzle. Capture the Flag.

Platform analisis CTF di `/ctf` yang berjalan di dalam aplikasi Next.js ini.
Portofolio tetap berada di `/` dan tidak terpengaruh.

Dokumen ini menjelaskan apa yang benar-benar berjalan, apa yang membutuhkan
konfigurasi tambahan, dan apa yang **belum** diimplementasikan.

---

## 1. Arsitektur singkat

| Lapisan | Implementasi |
| --- | --- |
| UI | Next.js App Router + React 19, komponen di `src/components/ctf/` |
| API | Route handler di `src/app/api/ctf/` |
| Analisis | Mesin TypeScript murni di `src/lib/ctf/` (tanpa shell) |
| Penalaran adaptif | `src/lib/ctf/reasoning/`: intent, konteks, hipotesis, anti-pengulangan, validasi silang, keyakinan, kontrol mutu, antrean per-sesi |
| Kontrol remote otonom | `src/lib/ctf/autonomous/`: interpreter bahasa alami, SSH nyata lewat container Kali, pembaca output, dekode multi-lapis, memori challenge, verifikasi flag, dan controller respons ringkas |
| Penyimpanan | JSON atomik `.data/ctf-intelligence.json` (default) atau PostgreSQL (`CTF_DATABASE_URL`) + upload di `CTF_WORKSPACE_ROOT` (default Windows `C:\CTF-AI`), dengan fallback baca `.data/uploads/` untuk file lama |
| AI | OpenAI, Anthropic, Gemini, Ollama, OpenAI-compatible; fallback Local Analyst |
| Enkripsi key | AES-256-GCM, master key dari `CTF_MASTER_KEY` atau `.data/master.key` |
| Auth | Cookie HMAC `ctf_access`, aktif hanya jika `CTF_ACCESS_PASSWORD` diisi |
| Eksekusi tool | Profil host opsional + Docker sandbox opsional + terminal Kali per-sesi (default nyala bila image tersedia) |

Tidak ada respons AI yang di-hardcode. Jika tidak ada provider yang
terkonfigurasi, sistem memakai **Local Analyst** deterministik dan memberi label
jelas bahwa itu bukan LLM.

---

## 2. Halaman

| Rute | Fungsi |
| --- | --- |
| `/ctf` | Dashboard: total, kategori, aktivitas terbaru |
| `/ctf/solver` | AI CTF Solver (chat streaming) |
| `/ctf/research` | Answer Discovery Engine: riset write-up publik → fallback solver |
| `/ctf/workspace` | Challenge + unggah artefak + analisis file |
| `/ctf/crypto` | Workbench kriptografi |
| `/ctf/forensics` | Analisis PCAP, arsip, metadata |
| `/ctf/stego` | PNG/WAV/QR/EXIF |
| `/ctf/web` | HTTP inspector (SSRF-guarded), JWT, header |
| `/ctf/reverse` | Header PE/ELF, section, import, mitigasi |
| `/ctf/binary` | Checksec, gadget, string |
| `/ctf/osint` | DNS, RDAP, TLS, username |
| `/ctf/tools` | Status tool + host runner + sandbox runner |
| `/ctf/reports` | Buat, pratinjau, ekspor Markdown/PDF |
| `/ctf/settings/ai` | Provider, model, key, routing |
| `/ctf/settings/system` | Bahasa, upload, kebijakan eksekusi |

Detail alur riset write-up, kosakata status web, dan batas keamanannya ada di
[`docs/ANSWER-DISCOVERY.md`](./ANSWER-DISCOVERY.md).

---

## 3. Struktur jawaban AI

Jawaban kompleks/default mengikuti delapan bagian tetap. Permintaan eksplisit
seperti "jawab singkat" atau "flag saja" tidak dipaksa ke format panjang; sistem
tetap menyertakan status keyakinan. Perintah operasional remote (connect,
inspect, continue, stop, dan sebagainya) juga sengaja dijawab ringkas agar tidak
mengganggu alur kerja; penalaran internal tetap disimpan, tetapi disembunyikan
dari UI kecuali toggle debug diaktifkan.

1. IDENTIFIKASI
2. ANALISIS AWAL
3. TOOLS
4. LANGKAH
5. PROSES
6. HASIL
7. PEMBELAJARAN
8. STATUS VERIFIKASI

Status yang mungkin: `VERIFIED`, `LIKELY`, `INCOMPLETE`, `UNSOLVED`.

`VERIFIED` hanya diberikan bila kandidat cocok dengan `expectedFlag` challenge.
Tanpa itu, status maksimal `LIKELY`. Flag tidak pernah dikarang.

---

## 4. Konfigurasi

Salin `.env.example` ke `.env.local`, lalu isi yang dibutuhkan.

```bash
# Wajib untuk membuka /ctf di jaringan yang tidak tepercaya
CTF_ACCESS_PASSWORD=...

# Disarankan di produksi (>= 16 karakter). Jika kosong, key file dibuat otomatis.
CTF_MASTER_KEY=...

# Opsional
CTF_DATA_DIR=.data
CTF_MAX_UPLOAD_MB=25
CTF_HOST_TOOLS=0
CTF_SANDBOX_ENABLED=0
CTF_SANDBOX_IMAGE=ctf-intelligence-sandbox:latest

# Terminal Kali untuk AI CTF Solver agent. Image remote menambahkan ssh/sshpass.
CTF_TERMINAL_IMAGE=ctf-kali-remote:latest
CTF_TERMINAL_TIMEOUT_MS=20000
CTF_TERMINAL_TTL_MINUTES=180
# Jaringan AKTIF secara default (bridge). Set 0 untuk --network none.
CTF_TERMINAL_NETWORK=1
# Budget solver otonom: 1.000.000 percobaan, dibatasi waktu 10 menit.
CTF_AGENT_MAX_ATTEMPTS=1000000
CTF_AGENT_TIME_BUDGET_MS=600000

# Remote SSH otonom. Kosong = menolak semua endpoint. Isi hanya host yang
# benar-benar diotorisasi (exact host, *.domain, atau IPv4 CIDR).
CTF_REMOTE_ALLOWED_HOSTS=
CTF_REMOTE_ALLOWED_PORTS=22
CTF_REMOTE_ALLOW_NETWORK_SCAN=0
CTF_AUTONOMOUS_MAX_ITERATIONS=8
CTF_AUTONOMOUS_MAX_STRATEGIES=5
CTF_AUTONOMOUS_MAX_REPEATED_COMMANDS=0
CTF_AUTONOMOUS_MAX_VERIFICATION_ATTEMPTS=3
CTF_AUTONOMOUS_TIME_BUDGET_MS=600000
CTF_AUTONOMOUS_COMMAND_TIMEOUT_MS=20000
CTF_AUTONOMOUS_MAX_OUTPUT_BYTES=64000
CTF_AUTONOMOUS_MAX_DECODE_DEPTH=4

# picoCTF / picoGym. Kosong = semua endpoint remote ditolak.
# Jalankan `npm run ctf:picoctf:configure` untuk mengisi kunci ini dengan aman.
CTF_WORKSPACE_ROOT=C:\CTF-AI
CTF_PICOCTF_MODE=1
CTF_PICOCTF_STRICT_ENDPOINTS=1
CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION=1
CTF_PICOCTF_ALLOWED_HOSTS=
CTF_PICOCTF_ALLOWED_PORTS=

# Penalaran adaptif (default direkomendasikan).
CTF_REASONING_MAX_ITERATIONS=8
CTF_REASONING_MAX_STRATEGIES=5
CTF_REASONING_MAX_REPEATED_COMMANDS=0
CTF_REASONING_MAX_VERIFICATION_ATTEMPTS=3
CTF_REASONING_SIMILARITY_THRESHOLD=0.82

# PostgreSQL (opsional). Jika diisi, JSON store tidak dipakai.
CTF_DATABASE_URL=postgres://ctf:secret@127.0.0.1:5433/ctf_intelligence
CTF_PG_POOL_SIZE=8
```

PostgreSQL lokal tanpa admin:

```bash
powershell -ExecutionPolicy Bypass -File scripts\ctf-pg-setup.ps1
npm run ctf:pg:start        # mencetak CTF_DATABASE_URL
npm run ctf:migrate         # impor data JSON lama (idempoten)
```

Key provider dapat diisi lewat UI AI Settings (dienkripsi dan disimpan di
server) atau lewat environment variable. UI tidak pernah menerima key kembali;
hanya status `hasKey`.

### Menyalakan semua layanan sekaligus

```powershell
npm run ctf:start          # Docker + PostgreSQL + AI lokal + Next.js + tunnel publik
npm run ctf:start -- -NoTunnel   # hanya lokal
npm run ctf:start -- -BuildKali  # bangun image Kali bila belum ada
npm run ctf:stop           # hentikan semuanya (tambah -KeepDatabase untuk biarkan PG)
npm run ctf:kali:build     # bangun image Kali dasar saja
npm run ctf:kali:remote:build  # bangun image Kali + ssh/sshpass untuk remote
```

`npm run ctf:start` memakai Node portable di
`%LOCALAPPDATA%\ctf-intelligence\tools\node`, menjalankan server di port 3130,
lalu membuka Cloudflare Quick Tunnel dan mencetak URL `https://*.trycloudflare.com`.
URL disimpan di `%LOCALAPPDATA%\ctf-intelligence\tools\run\public-url.txt`, log
di folder yang sama. Quick Tunnel bersifat sementara: URL berubah setiap kali
tunnel dijalankan ulang, dan layanan berhenti bila komputer dimatikan.

**Wajib** mengisi `CTF_ACCESS_PASSWORD` sebelum memakai tunnel publik; tanpa
password, siapa pun yang memiliki URL dapat membuka `/ctf`.

Menghapus challenge otomatis menghapus file fisik, evidence, flag, dan tool run
terkait (sesi tetap disimpan, hanya tautan challenge-nya dilepas). Untuk
membersihkan record yatim sisa versi lama:

```powershell
npm run ctf:cleanup
```

---

## 5. Eksekusi tool, sandbox, dan terminal Kali

**Host tools** menjalankan profil tetap (mis. `file`, `strings`, `readelf`)
dengan argumen file yang dikontrol. Tidak ada shell bebas. Default mati dan
harus diaktifkan di System Settings. Jika binary tidak ada, status dilaporkan
`error` apa adanya.

**Docker sandbox profil tetap** adalah jalur untuk tool runner di halaman Tools:

```bash
npm run ctf:sandbox:build
# lalu set CTF_SANDBOX_ENABLED=1 atau aktifkan di System Settings
```

Pembatas yang selalu dipasang: `--network none`, `--read-only`,
`--cap-drop ALL`, `--security-opt no-new-privileges`, `--user 65534:65534`,
memori 256 MB, CPU 0.5, PID 64, timeout 30 detik, dan `--rm`.

### 5.1 Terminal Kali per-sesi

AI Solver dan panel terminal memakai image terpisah:

```bash
npm run ctf:kali:build        # kalilinux/kali-rolling + tool analisis CTF
npm run ctf:kali:remote:build # turunan di atas + openssh-client + sshpass
```

Set `CTF_TERMINAL_IMAGE=ctf-kali-remote:latest` bila fitur SSH remote dipakai.
Image inilah yang dipakai untuk koneksi CTF yang diotorisasi; terminal lokal dan
remote tetap dibedakan oleh state sesi.

Satu container persistennya dibuat untuk setiap sesi chat
(`ctf-term-<session-suffix>`). Container tersebut:

- berjalan sebagai user `1000:1000` (bukan root), `cap-drop ALL`,
  `no-new-privileges`, rootfs read-only;
- menambahkan `NET_RAW`, `NET_ADMIN`, `NET_BIND_SERVICE` ke bounding set agar
  binary berkapasitas file seperti `nmap` dapat dieksekusi. Isolasi tetap
  terjaga lewat network namespace sendiri, user non-root, rootfs read-only,
  tanpa mount host selain `/analysis`, dan `no-new-privileges`;
- memakai `--network bridge` secara default, sehingga `curl`, `wget`, `nc`, dan
  `nmap` dapat digunakan untuk challenge yang membutuhkan jaringan.
  Set `CTF_TERMINAL_NETWORK=0` bila isolasi penuh (`--network none`) diperlukan;
- memiliki tmpfs `/tmp` dan `/work` (writable, owner `1000:1000`), serta
  `/analysis` berisi salinan read-only dari file yang diunggah + `MANIFEST.txt`;
- dibatasi memori 1 GB, CPU 1, PID 256, timeout per perintah
  `CTF_TERMINAL_TIMEOUT_MS` (5–120 detik), dan dimusnahkan setelah
  `CTF_TERMINAL_TTL_MINUTES` tanpa aktivitas;
- tidak pernah menjalankan biner yang diunggah sebagai program; file hanya
  dibaca/dianalisis secara statis.

Pencarian tool dilakukan di dalam container saat sesi dimulai. Planner AI
menerima daftar tool yang benar-benar tersedia dan tool yang tidak ada, sehingga
ia tidak mengandaikan `binwalk`, `zsteg`, `exiftool`, dan sebagainya terpasang.
Bila tool tidak tersedia, agen memilih alternatif atau menyatakan kebutuhan
instalasinya.

### 5.2 Protokol eksekusi

Request `POST /api/ctf/terminal` memuat `sessionId`, `command`, opsional
`fileIds`, dan `timeoutMs`. Setiap hasil eksekusi mengembalikan:

| Field | Arti |
| --- | --- |
| `commandId` | UUID unik untuk perintah ini |
| `sessionId` | Sesi terminal yang menjalankan perintah |
| `cwd` | Working directory persisten (dimulai dari `/work`) |
| `command` | Perintah asli |
| `stdout` / `stderr` | Output standar dan error, dipisahkan |
| `output` | Gabungan keduanya untuk konsumen lama |
| `status` | `ok`, `error`, atau `blocked` |
| `exitCode` | Exit code nyata dari container |
| `durationMs` | Durasi eksekusi |
| `artifacts` | File yang dihasilkan di `/work` atau `/tmp` |
| `processes` | Snapshot proses terpantau di dalam container |
| `requestId`, `purpose`, `hypothesisId` | Jejak penalaran yang menyertai eksekusi agen (bila ada) |

`GET /api/ctf/terminal?sessionId=...` mengembalikan status container, info sesi,
dan 100 riwayat perintah terakhir. `GET /api/ctf/terminal/download?sessionId=...&path=...`
mengunduh artifact biner dari container (hanya path `/work/...` atau `/tmp/...`).

`validateTerminalCommand` hanya menolak perintah yang membahayakan host atau
melakukan container escape: runtime container, namespace escape, mount, akses
root host, operasi disk, escalation, dan fork bomb. Perintah jaringan
(`curl`, `wget`, `nc`, `nmap`, termasuk `curl … | sh`) diizinkan di dalam
container. Penegakan utama tetap isolasi container: validation hanyalah lapisan
tambahan.

#### 5.2.1 Terminal WebSocket interaktif

`npm start` menjalankan custom server (`server.ts`, Next.js + `ws`) sehingga
panel terminal bisa memakai transport WebSocket di
`/api/ctf/terminal/ws?sessionId=...`. Handshake memakai cookie sesi `ctf_access`
yang sama dengan HTTP; tanpa cookie, upgrade ditolak `401`. Stream aktif hanya
untuk satu perintah per sesi. Pesan yang didukung: `ping`, `start`, `exec`,
`stdin`, `kill`, `status`. Client menerima `ready`, `pong`, `session`, `started`,
`chunk` (stdout/stderr realtime), `result`, `error`, dan `status`. Isolasi sesi
ditegakkan: satu WebSocket hanya boleh mengendalikan container sesinya sendiri.
Fallback HTTP `POST /api/ctf/terminal` tetap tersedia.

### 5.3 Alur agen otonom

`POST /api/ctf/agent` mengalirkan event NDJSON (`meta`, `reasoning`, `note`,
`terminal`, `plan`, `command`, `output`, `delta`, `done`, `saved`, `error`).
Event `reasoning` memuat `requestId`, niat, keyakinan, dan hipotesis aktif.
Permintaan chat/agent dengan `sessionId` yang sama dijalankan berurutan oleh
antrean percakapan, sehingga pesan konkuren tidak mencampur konteks. Urutannya:

1. **Inisialisasi** — start/reuse container dan discovery tool.
2. **Environment check** — `id`, `uname`, `pwd`, storage, dan status tool
   dijalankan lebih dulu; outputnya nyata.
3. **Identifikasi challenge** — bundle lokal + deskripsi + lampiran + pertanyaan.
4. **Seleksi tool** — planner AI menghasilkan JSON `commands` (maks 6) yang
   sudah difilter oleh validator; fallback deterministik bila model gagal.
5. **Eksekusi & interpretasi** — setiap perintah dijalankan di container,
   stdout/stderr asli dikirim balik ke model dan disimpan sebagai evidence.
6. **Anti-pengulangan** — default `CTF_REASONING_MAX_REPEATED_COMMANDS=0`,
   sehingga perintah identik dilewati dan strategi lain dipakai. Jika batas
   dinaikkan, permintaan ke-`N+1` mereset counter dan solver mulai lagi dari
   perintah pertama dengan strategi berbeda. Kemiripan semantik jawaban dan
   perintah juga diukur (`CTF_REASONING_SIMILARITY_THRESHOLD`); pengulangan
   diizinkan hanya untuk verifikasi eksplisit. Total percobaan maksimal
   **1.000.000** (`CTF_AGENT_MAX_ATTEMPTS`), dibatasi waktu
   `CTF_AGENT_TIME_BUDGET_MS` (default 10 menit, maksimal 1 jam).
7. **Refinement** — bila jawaban belum pasti, AI menyusun perintah lanjutan dari
   output nyata, dibatasi `CTF_REASONING_MAX_ITERATIONS` (default 8) dan
   `CTF_REASONING_MAX_STRATEGIES` (default 5); bila gagal, strategi
   deterministik yang dipakai.
8. **Validasi flag** — placeholder seperti `flag{...}` dibuang. Kandidat hanya
   diterima bila sama persis dengan `expectedFlag`, atau muncul minimal pada
   **dua operasi nyata yang berbeda**. Status disimpulkan dengan `inferStatus`;
   tidak ada flag yang dikarang.
9. **Laporan akhir** — jawaban delapan bagian + **waktu pengerjaan**, jumlah
   percobaan, dan jumlah siklus disimpan lewat `persist.ts` dan dikirim di event
   `saved` (`elapsedMs`, `attempts`, `cycles`, `maxAttempts`). Saat laporan dibuat
   dengan `sessionId`, ekspor Markdown/PDF memakai jawaban agent ini bila ada,
   sehingga waktu dan bukti terminal ikut terbawa.

Catatan penting: jumlah 1.000.000 adalah **batas anggaran**, bukan klaim bahwa
solver akan benar-benar menjalankan satu juta perintah; batas waktu biasanya
berhenti lebih dulu. Tanpa `expectedFlag`, submission platform CTF, atau oracle
lain, status maksimal adalah `LIKELY`/`INCOMPLETE` — tidak ada jaminan mutlak
"tanpa kesalahan".

Bila Docker/LLM tidak tersedia, UI menampilkan pesan jujur dan agen memakai
rencana deterministik; tidak ada simulasi output.

Bila Docker tidak tersedia, halaman Tools dan panel terminal menampilkan status
yang jujur. Tidak ada fallback diam-diam ke eksekusi host.

### 5.4 Kontrol SSH remote otonom

Modul `src/lib/ctf/autonomous/` memperluas solver tanpa menggantikan alur chat,
provider AI, atau terminal lokal. Perintah yang dikenali antara lain:
`connect`, `inspect`, `read terminal`, `follow hint`, `decode`,
`investigate next stage`, `continue`, `find flag`, `stop`, `disconnect`, dan
`status`. Satu pesan diproses sekali oleh interpreter; pertanyaan umum dan
permintaan laporan tetap memakai jalur AI biasa.

Analisis challenge/berkas di chat biasa kini otomatis memakai terminal Kali
lokal tanpa perlu mengaktifkan checkbox Kali Agent. Pesan seperti "analisis file
ini", "periksa challenge ini", atau "jalankan tool" diterjemahkan menjadi
`AUTO_ANALYZE`. Engine menjalankan container Kali per sesi, menemukan tool yang
benar-benar terpasang, lalu memasangkan semua tool katalog (`file`, `strings`,
`exiftool`, `readelf`, `objdump`, `tshark`, `binwalk`, `checksec`, `pdfinfo`,
`zsteg`, `steghide`, `foremost`, `volatility3`, `radare2`, `ghidra`, `gdb`,
`nmap`, `hashcat`, `john`) dengan perintah analisis nyata sesuai jenis berkas dan
bukti yang muncul. Tool `docker` tetap menjadi lapisan isolasi, bukan perintah
yang dijalankan di dalam container. Jika profil SSH remote tidak tersedia,
perintah solver seperti `find flag` juga jatuh ke jalur Kali lokal ini.

Agar jalur ini aktif, `sandboxEnabled` dan `hostToolsEnabled` harus `true` pada
System Settings, image `ctf-kali-remote:latest` harus tersedia, dan Docker daemon
harus berjalan. Status tool di `/api/ctf/tools` kini melaporkan ketersediaan di
image Kali, bukan hanya PATH host.

Perintah `nc host port` juga dikenali sebagai `NETCAT_CONNECT`. Secara default
berlaku **mode terbuka**: semua host/port yang formatnya valid diizinkan langsung
tanpa perlu memperbarui daftar. Mode lama dengan allowlist eksplisit bisa
diaktifkan kembali lewat `CTF_REMOTE_STRICT_ENDPOINTS=1`; dalam mode itu endpoint
harus terdaftar di `CTF_REMOTE_ALLOWED_HOSTS` dan `CTF_REMOTE_ALLOWED_PORTS`.
Untuk challenge interaktif yang meminta perintah
pembalik per langkah (misalnya "Text Transformations Challenge"), AI menjalankan
pemecantar Python ringan di dalam container Kali dengan network bridge. Script
ini membaca prompt dan hint langsung dari socket, memetakan hint ke perintah
pembalik (`base64 -d`, `rev`, `tr '-' '_'`, `tr '()' '{}'`, ROT13, dan lain-lain),
mengirim jawaban, lalu menangkap transkrip akhir. Kandidat flag diambil hanya
dari output perintah yang berhasil dan diverifikasi lewat indikator penyelesaian
server sebelum dilaporkan. Decode spontan (XOR/ROT13/Base64 brute force) hanya
dipakai sebagai petunjuk, bukan bukti; output perintah gagal (misalnya
`Connection refused`) tidak boleh menghasilkan kandidat flag sama sekali.
Kandidat `POTENTIAL` tidak pernah dipromosikan menjadi `verifiedFlag`, sehingga
tidak bisa berubah menjadi "Flag: ..." pada iterasi berikutnya. Setiap perintah
dan outputnya dialirkan ke panel **Jejak eksekusi Kali** secara realtime, termasuk
saat chat biasa; penanda `Flag terverifikasi ditemukan` hanya muncul setelah
oracle/server menerima flag. Koneksi dibatasi waktu dan jumlah perintah.

Perintah `git clone ssh://user@host:port/path.git` dikenali sebagai `GIT_CLONE`
dan dijalankan di container Kali yang sama. Host, port, username, dan path
divalidasi sebelum disusun menjadi URL; repository di-clone ke `/work/challenge`,
lalu isinya diperiksa untuk mencari flag. Pemeriksaan host key tetap aktif
lewat `StrictHostKeyChecking=accept-new` dengan `known_hosts` di `/work/.ssh`.

Contoh endpoint historis untuk "Text Transformations Challenge" adalah
`chatelaine.cylabacademy.net:20638` (port lama `32626` sudah tidak merespons).
Pada mode picoGym, host/port lain tidak bisa langsung dicoba tanpa membarui
allowlist yang diberikan operator. Flag final diverifikasi langsung dari baris
`Congratulations! You've recovered the original flag:` pada transkrip server.

Koneksi memakai `ssh`/`sshpass` asli di dalam container Kali yang sama. Sistem
membedakan local Kali cwd dan remote cwd, menyimpan connection ID aktif,
challenge ID, perintah/output terakhir, stage, dan status. Semua stdout/stderr,
prompt, error, path, permission, indikator tahap, dan pesan sukses/gagal dibaca
dari eksekusi nyata. Tidak ada host, username, password, key, token, flag, atau
output yang dikarang; sistem hanya menanyakan informasi esensial yang hilang.

Sebelum terhubung dalam mode strict (`CTF_REMOTE_STRICT_ENDPOINTS=1`) atau mode
picoGym, operator harus mengisi allowlist host yang sesuai. Sidik
jari host key SHA256 wajib diberikan pengguna, dicocokkan dari `ssh-keyscan`,
lalu koneksi dipaksa memakai `StrictHostKeyChecking=yes` dengan
`UserKnownHostsFile` khusus profil. Password/private key/passphrase dienkripsi
di store, ditulis ke container lewat stdin `docker exec -i` menjadi file mode
`0600`, tidak pernah masuk argv, prompt, `ToolRun.args`, log, atau respons API,
serta dihapus saat disconnect.

Perintah remote divalidasi sebelum dikirim. Perubahan state memerlukan izin
eksplisit; `nmap`/network scan hanya saat `CTF_REMOTE_ALLOW_NETWORK_SCAN=1`.
Timeout, batas output, kedalaman dekode, anti-pengulangan, dan anggaran
iterasi memakai variabel `CTF_AUTONOMOUS_*`. Audit log dan state challenge
tersimpan di JSON atau PostgreSQL. Tombol **Stop** membatalkan permintaan di
browser dan menandai sesi remote sebagai stopped.

Dekode mendukung Caesar/ROT, Base64/32/58, hex, binary, ASCII/desimal, XOR,
analisis frekuensi, URL, HTML entity, Unicode, Morse, Vigenère, substitusi,
tanda tangan file, metadata, pesan tersembunyi, dan beberapa lapisan bertingkat.
Hasil antara, kandidat flag, flag terverifikasi, dan challenge selesai sengaja
dibedakan. Jawaban operasional hanya catatan singkat plus hasil akhir; laporan
delapan bagian tetap tersedia lewat jalur laporan/agent eksplisit.

Endpoint API terkait: `GET/POST/DELETE /api/ctf/remote/profiles`,
`POST /api/ctf/remote/stop`, dan `GET /api/ctf/remote/status`. Status sengaja
menyembunyikan perintah terakhir dan flag belum terverifikasi.

Terverifikasi pada mesin ini: `npm run ctf:autonomous:acceptance` menjalankan
A–R memakai server SSH `paramiko` di container fixture
`ctf-ssh-fixture:latest` dan container `ctf-kali-remote:latest` nyata pada
bridge Docker yang sama. Server fixture dipakai karena listener di host Windows
tidak dapat dijangkau dari container bila firewall memblokir subnet Docker.
Cakupannya: koneksi, inspeksi, ROT13, lanjutan tahap, verifikasi flag, pemulihan
setelah perintah ditolak, state multi-tahap, kontinuitas konteks, isolasi
pertanyaan di luar challenge, otorisasi origin, batas ukuran, dan penolakan
kandidat `POTENTIAL`. Bangun fixture dengan `npm run ctf:fixture:build`.
Verifikasi akhir produksi juga mencakup handshake WebSocket tanpa cookie yang
ditolak `401`, dua sesi WS dengan container Kali berbeda, stdin dari sesi lain
yang ditolak, backend Python/FastAPI, provider Playwright/Edge, serta cookie
operator yang hanya dikirim ke origin resmi.

Terverifikasi pada mesin ini: image Alpine 3.20 + `file`, `strings`, `xxd`,
`python3`, `tcpdump` dibangun lokal, dan probe isolasi menunjukkan
`uid=65534(nobody)`, network diblokir (`NETWORK-BLOCKED`), rootfs read-only,
serta `/tmp` tmpfs terpisah. Profil `identify`, `strings`, `hashes`, dan `hex`
mengembalikan output nyata dari file yang diunggah. Image Kali
`ctf-kali-sandbox:latest` juga berhasil dibangun (termasuk `zsteg`).

Catatan Docker Desktop di Windows: daemon harus hidup (`Docker Desktop.exe`
berjalan) dan WSL2 virtualization aktif. Sandbox tidak dipakai untuk mengeksekusi
biner yang diunggah; profil hanya menjalankan perintah analisis tetap di dalam
container.

### 5.5 Backend Python/FastAPI opsional

Service kecil di `backend/main.py` menyediakan `GET /health` dan `POST /analyze`
untuk inspeksi artefak berbasis stdlib (magic bytes, SHA-256, entropi, string,
batas 10 MB). Service tidak menerima secret dan tidak pernah mengeksekusi
konten artefak. Dijalankan lewat `npm run ctf:py:start` pada
`http://127.0.0.1:3131` (override dengan `CTF_PY_BACKEND_URL`) dan dipanggil
dari aplikasi lewat `src/lib/ctf/py-backend.ts` serta
`GET/POST /api/ctf/python`. Jika service mati, route melaporkan `health: null`;
tidak ada hasil simulasi. Script `scripts/ctf-sidecars-verify.js` memverifikasi
Python, Playwright, dan WebSocket secara end-to-end.

---

## 6. Keamanan

- Cookie sesi HMAC, `httpOnly`, `sameSite=lax`, `secure` di produksi, path `/`.
- Rate limit per-IP pada endpoint tulis.
- Validasi upload: ekstensi allowlist, batas ukuran server-side, pemeriksaan magic.
- File disimpan dengan mode `0600` dan nama berbasis ID, bukan nama asli.
- HTTP inspector memblokir alamat privat/loopback kecuali `allowPrivateHttp`
  diaktifkan secara eksplisit.
- Audit log mencatat upload, tool run, perubahan settings, dan laporan.

---

## 7. Penyimpanan: JSON dan PostgreSQL

Dua backend, dipilih lewat environment. Bentuk data yang sama
(`src/lib/ctf/types.ts`), sehingga UI tidak berubah.

| Backend | Kapan aktif | Catatan |
| --- | --- | --- |
| JSON (`src/lib/ctf/store.ts`) | `CTF_DATABASE_URL` kosong | Default. Atomic rename + queue tulis in-process. |
| PostgreSQL (`src/lib/ctf/pg.ts`) | `CTF_DATABASE_URL` diisi | Skema dibuat otomatis saat pertama dipakai. |

Detail PostgreSQL:

- 21 tabel: `ctf_settings` + `ctf_challenges`, `ctf_files`, `ctf_sessions`,
  `ctf_messages`, `ctf_evidence`, `ctf_tool_runs`, `ctf_flags`, `ctf_reports`,
  `ctf_audit`, empat tabel penalaran `ctf_reasoning_contexts`, `ctf_intents`,
  `ctf_hypotheses`, `ctf_reasoning_checks`, serta empat tabel remote
  `ctf_remote_profiles`, `ctf_remote_connections`, `ctf_challenge_states`, dan
  `ctf_remote_audit`, serta `ctf_platform_connections`, `ctf_execution_steps`,
  dan `ctf_verification_records`. Setiap baris menyimpan payload `jsonb` ditambah kolom
  terindeks (`created_at`, `status`, `challenge_id`, dst).
- Riwayat penalaran menyimpan pertanyaan, jawaban, niat, hipotesis, perintah,
  hasil, metode, kegagalan, temuan, pertanyaan terbuka, dan state challenge
  dengan `requestId`/`conversationId`. `GET /api/ctf/sessions/[id]` mengembalikan
  empat koleksi tersebut untuk reload UI.
- Setiap mutasi berjalan dalam satu transaksi yang memegang
  `pg_advisory_xact_lock`, jadi beberapa instance aman menulis bersamaan.
- `npm run ctf:migrate` mengimpor JSON lama secara idempoten (upsert per id);
  `--prune` menghapus baris yang tidak ada di JSON.
- Upload tetap di disk (`CTF_DATA_DIR/uploads`); pindah ke object storage
  belum diimplementasikan.
- System Settings menampilkan backend aktif, status koneksi, versi server, dan
  jumlah tabel.

---

## 8. Verifikasi

Perintah yang tersedia:

```bash
npm run typecheck
npm run lint
npm run ctf:smoke              # kripto, analyzer, PNG, laporan, PDF, terminal
npm run ctf:reasoning:smoke    # intent, konteks, anti-pengulangan, validasi
npm run ctf:autonomous:smoke   # interpreter, reader, dekode, verifikasi
npm run ctf:fixture:build      # image SSH fixture untuk acceptance
npm run ctf:autonomous:acceptance # A-R dengan SSH nyata + container Kali
npm run ctf:picoctf:configure  # init workspace + allowlist picoGym di .env.local
npm run ctf:picoctf:verify     # kategori, workspace, endpoint, konfirmasi jaringan
npm run ctf:py:start          # backend Python/FastAPI opsional
npm run ctf:sidecars:verify   # Python + Playwright + WebSocket end-to-end
npm run build
```

`npm run ctf:smoke` menguji jalur nyata: decode Base64/XOR, deteksi flag,
parsing PNG `tEXt`, penyusunan bundle, pembuatan PDF (header `%PDF-`),
serta environment command, analysis plan, validator perintah, dan inferensi
status terminal. `ctf:autonomous:acceptance` memerlukan Docker dan image
`ctf-kali-remote:latest` serta `ctf-ssh-fixture:latest`; skrip membuat container
SSH fixture sementara dengan host key RSA 2048 (sidik jari SHA-256 dihasilkan
fixture dan dicocokkan sebelum koneksi), akun `ctf`/password uji, serta
container Kali dan data uji sendiri, lalu membersihkannya di akhir.
`ctf:sidecars:verify` memerlukan server produksi di port 3130, backend Python di
3131, Docker, dan Playwright/Edge; skrip ini memakai fixture HTTP lokal dan
container Kali nyata.

---

## 9. Status jujur

- **Berjalan tanpa konfigurasi:** analisis file lokal, kriptografi, stego,
  forensics, reverse/binary statis, OSINT, laporan, ekspor Markdown/PDF,
  penyimpanan JSON.
- **Terverifikasi di mesin ini:** PostgreSQL 16.4 lokal (port 5433, 21 tabel,
  persistence lintas request), Docker sandbox (isolasi non-root/read-only,
  jaringan bridge aktif), image `ctf-kali-sandbox:latest` dan
  `ctf-kali-remote:latest`, koneksi SSH nyata A–R lewat container fixture,
  WebSocket terminal dengan stdin interaktif, backend Python/FastAPI, provider
  Playwright/Edge, serta AI lokal llama.cpp + Qwen2.5 0.5B lewat provider
  OpenAI-compatible (chat streaming menghasilkan `flag{llm_works}` dengan status
  VERIFIED).
- **Berjalan setelah dikonfigurasi:** AI provider cloud (OpenAI/Anthropic/Gemini
  butuh key), Ollama, host tools. Untuk mematikan jaringan sama sekali, set
  `CTF_TERMINAL_NETWORK=0`.
- **Belum diimplementasikan (tidak diklaim):**
  - Emulator terminal penuh (xterm.js/PTY). WebSocket menyediakan stdin/stdout
    interaktif per perintah, bukan emulasi terminal lengkap.
  - Redis; antrean perintah memakai `Promise` in-process dan TTL in-memory.
  - tool yang tidak terpasang di image (mis. scalpel, volatility3, autopsy,
    stegseek, radare2/rizin, checksec, CyberChef, Scapy, BeautifulSoup, Burp,
    ZAP). Availability dicek dan dilaporkan apa adanya, bukan diasumsikan.
- **Tidak diklaim pula:** koneksi ke server CTF nyata milik pengguna (belum ada
  host, kredensial, dan sidik jari yang diberikan), eksekusi biner di host,
  object storage, dan flag yang belum diverifikasi. Model 0.5B lemah untuk
  decoding kripto mentah; analisis deterministik tetap yang mengekstrak dan
  memverifikasi kandidat flag.

## Universal Autonomous Solver — bagian yang benar-benar aktif

- **Pemahaman berbasis bukti:** `universal-understanding.ts` menggabungkan judul,
  deskripsi, hint, nama/MIME file, output terminal, source, dan metadata untuk
  klasifikasi 10 kategori. Field yang tidak ada dilaporkan di
  `missingInformation`, bukan diarang. Endpoint: `POST /api/ctf/understanding`.
- **Reasoning multi-hipotesis:** `hypothesis-reasoning-engine.ts` membentuk
  hipotesis dari sinyal nyata, mencatat bukti pendukung/bertentangan,
  requirements verifikasi, status, dan confidence. Hipotesis pertama tidak
  otomatis menang; peringkat memakai bobot bukti dan independensi sumber.
- **Platform discovery:** adapter CTFd memakai REST API resmi dengan token dari
  operator. Delapan platform lain memakai adapter halaman publik generik yang
  hanya membaca origin resmi. Token atau Cookie sesi operator dikirim hanya ke
  origin resmi pada request yang sama dan tidak disimpan; UI menghapus nilainya
  setelah dipakai. Tidak ada login otomatis, CAPTCHA bypass, atau submit otomatis
  kecuali `allowSubmission: true` dengan bukti terverifikasi. Endpoint:
  `GET/POST /api/ctf/platforms`; UI: `/ctf/platforms`.
- **Mode picoCTF/picoGym:** enam kategori resmi dipetakan ke taksonomi internal,
  artefak dan analisis dipisah per challenge di `C:\CTF-AI`, endpoint instance
  harus masuk allowlist operator, dan aksi jaringan butuh checkbox konfirmasi
  per pesan. Token/Cookie tidak dibaca dari environment dan tidak disimpan.
  Detail: `docs/PICOCTF-SETUP.md`.
- **Navigasi web terautorisasi:** `authorized-web-navigator.ts` memaksa origin
  resmi, HTTPS (kecuali fixture lokal eksplisit), anti-SSRF, redirect error,
  timeout, dan batas ukuran. Konten halaman ditandai `untrusted: true` dan
  instruksi yang mencoba mengoverride aturan keamanan dilaporkan, tidak
  dijalankan. Playwright bersifat opsional; fallback memakai `fetch`.
  Endpoint: `POST /api/ctf/web/read`.
- **Penjelasan & format akhir:** "jelaskan bagaimana kamu menyelesaikannya"
  dirutekan ke `EXPLAIN_SOLUTION` dan disusun hanya dari perintah/output/hint/
  verifikasi yang tersimpan. `final-response-format.ts` menghasilkan bagian
  `CHALLENGE / STATUS / FINAL ANSWER / SHORT SOLUTION / VERIFICATION`.
- **Kosakata verifikasi:** `CONFIRMED` (setara `VERIFIED`), `HIGH CONFIDENCE`,
  `PROBABLE`, `UNVERIFIED`, dan `REJECTED`. Kandidat `POTENTIAL` tidak pernah
  otomatis menjadi `CONFIRMED`.
- **Entitas tersimpan:** `platformConnections`, `executionSteps`, dan
  `verificationRecords` mengikuti pola JSON/Postgres yang ada (total 21 tabel
  Postgres dengan `ctf_settings`). Token platform tidak pernah disimpan.
- **Batasan yang masih jujur:** tidak ada emulator PTY/xterm.js, tidak ada
  integrasi API resmi penuh untuk Root-Me/HTB Academy/TryHackMe (butuh sesi
  pengguna resmi), dan backend Python hanya untuk analisis artefak terbatas
  (bukan solver otonom). Semua batasan ini tidak diklaim sebagai fitur selesai.
- **Pengujian:** `npm run typecheck`, `npm run lint`,
  `npm run ctf:autonomous:smoke`, `npm run ctf:autonomous:acceptance` (A–R),
  dan `npm run build` harus lolos. Uji stream lintas HTTP menunjukkan event
  `execution-plan`, `step`, `command`, `output`, dan `verification` tanpa flag
  palsu maupun kebocoran secret.
