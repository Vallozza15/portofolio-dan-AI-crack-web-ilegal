# Answer Discovery Engine — riset write-up publik dulu, solver kemudian

Fitur ini menambah alur **web research first** ke aplikasi CTF yang sudah ada.
Solver otonom, terminal Kali, acceptance A–R, dan format laporan internal tidak
diubah.

## 1. Alur

1. Operator memberi **judul + platform** (kategori, URL, deskripsi opsional).
2. `buildIdentity()` membangun profil identitas hanya dari input: judul
   dinormalisasi, platform, event/tahun, kategori, format flag, variasi judul,
   token deskripsi, dan artefak. Field yang tidak ada dibiarkan kosong.
3. `buildSearchQueries()` membuat 10 pola pencarian tetap + variasi kategori.
4. GitHub **public REST API** dipakai tanpa scraping: repo, issue, dan gist.
   Jika operator mengisi API key di UI, Brave Search API atau Google Custom
   Search JSON API dipakai sebagai tambahan. Kunci tidak pernah dibaca dari
   `process.env`. Operator juga bisa menempelkan URL write-up yang sudah
   diketahui lewat field `seedUrls`; URL tersebut diambil langsung dari origin
   asli, tanpa mesin pencari dan tanpa API key.
5. Setiap hasil diambil dengan `safeFetch` (SSRF guard, timeout, batas ukuran,
   redirect dibatasi). Konten halaman ditandai **tidak tepercaya**; instruksi
   di dalamnya hanya dilaporkan, tidak dijalankan.
6. `scoreSource()` memberi skor 0–100 dari judul, platform, event, tahun,
   kategori, deskripsi, artefak, prefix flag, dan metodologi. **Judul saja
   dibatasi maksimal 69**, sehingga tidak pernah dianggap exact-match.
7. `crossValidate()` mengelompokkan kandidat flag, menghitung sumber kuat dan
   provenansi independen, lalu menetapkan status.
8. Jika tidak ada jawaban yang memenuhi ambang, engine memancarkan event
   `fallback`; route otomatis menjalankan solver otonom lokal bila sesi chat
   diberikan dan aksi jaringan dikonfirmasi.

## 2. Status

| Status | Syarat |
| --- | --- |
| `VERIFIED` | Kandidat cocok dengan bukti validator resmi yang diberikan operator lewat `officialValidation` |
| `MULTI-SOURCE CONFIRMED` | Flag sama pada minimal dua sumber exact-match/strong dari provenansi independen, tanpa validator resmi |
| `SOURCE CONFIRMED` | Flag pada satu sumber dengan skor minimal 85 |
| `HIGH CONFIDENCE` | Kandidat hanya pada sumber potensial (skor 70–84) |
| `CONFLICTING` | Dua kandidat dengan dukungan kuat sama kuatnya |
| `UNVERIFIED` | Tidak ada kandidat yang memenuhi ambang |

`VERIFIED` **tidak** diberikan hanya karena write-up publik atau karena solver
internal merasa yakin. Konfirmasi solver internal dipetakan sebagai
`HIGH CONFIDENCE` kecuali ada bukti validator resmi.

Flag yang berbeda antarinstansi (mis. challenge yang membuat flag unik per
koneksi) akan menghasilkan `CONFLICTING`. Aplikasi lalu mencantumkan kandidat
publik sebagai **bukan bukti resmi** dan menyarankan mengikuti langkah
`SOLUTION` pada instance milik operator. Metode yang disepakati beberapa
sumber tetap ditampilkan, tetapi tidak diubah menjadi `VERIFIED`.

## 3. API

### `POST /api/ctf/research`

Body:

```json
{
  "title": "Basic File Exploitation",
  "platform": "picoCTF",
  "category": "Forensics",
  "url": "",
  "description": "",
  "seedUrls": [
    "https://medium.com/@user/picoctf-bytemancy-1-writeup-...",
    "https://raahguu.dev/writeups/2026/picoctf/bytemancy-1/"
  ],
  "sessionId": "sesi_chat_untuk_fallback",
  "allowFallback": true,
  "confirmNetworkAction": false,
  "maxSources": 16
}
```

Respons berupa NDJSON, satu event per baris: `stage`, `identity`, `query`,
`provider`, `source`, `candidate`, `status`, `answer`, `fallback`,
`solver-event`, `solver-answer`, `error`, `done`. Semua event berasal dari
eksekusi nyata; tidak ada progress simulasi.

Field opsional `officialValidation: { flag, evidence }` hanya boleh dipakai
jika operator benar-benar memiliki bukti penerimaan dari validator resmi.
`evidence` minimal 8 karakter.

### `GET /api/ctf/research`

Tanpa `id`: daftar sesi ringkas. Dengan `?id=research_...`: sesi lengkap.

### `PATCH /api/ctf/research/settings`

```json
{
  "provider": "brave",
  "enabled": true,
  "apiKey": "kunci-dari-operator",
  "cx": "hanya-untuk-google-cse"
}
```

`GET /api/ctf/research/settings` mengembalikan `hasKey`, `hasGithubToken`,
`provider`, `enabled`, dan `cx` saja. Nilai kunci tidak pernah dikembalikan.

## 4. Penyimpanan

- `research-settings.json`: konfigurasi penyedia; API key dan GitHub token
  dienkripsi AES-256-GCM memakai master key yang sama dengan provider AI.
- `research-sessions.json`: maksimal 40 sesi; berisi identitas, query, hasil,
  sumber, kandidat, status, jawaban, dan event. Tidak menyimpan kredensial.

Keduanya berada di `CTF_DATA_DIR` (default `.data`) dan ditulis atomik.

## 5. Batasan

- Tidak ada scraping mesin pencari, tidak ada bypass Cloudflare/login/paywall.
- Hanya GitHub public API dan API web resmi dengan key operator.
- Write-up berbayar/privat tidak diakses.
- Kecocokan nama saja tidak mencukupi; deskripsi, platform, artefak, atau
  bukti lain dibutuhkan untuk skor tinggi.
- Jika sumber saling bertentangan, aplikasi melaporkan `CONFLICTING` dan tidak
  memilih salah satu secara arbitrer.

## 6. Verifikasi

```powershell
npm run typecheck
npm run lint
npm run ctf:research:smoke
npm run build
```

`ctf:research:smoke` berjalan offline dan menguji normalisasi, generator query,
penolakan bukti berbasis judul saja, ekstraksi flag, semua status, format
jawaban, enkripsi kunci, dan penyimpanan sesi.
