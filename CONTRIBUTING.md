# Contributing

Terima kasih sudah ingin berkontribusi. Proyek ini adalah portofolio pribadi
dengan komponen CTF Intelligence, jadi kontribusi harus menghormati batas
keamanan dan privasi.

## Alur kontribusi

1. Fork repositori.
2. Buat branch baru: `git checkout -b fitur/nama-singkat`.
3. Salin `.env.example` menjadi `.env.local` dan isi nilai lokal.
4. Jalankan `npm ci`.
5. Lakukan perubahan kecil yang fokus.
6. Jalankan pemeriksaan:

   ```bash
   npm run typecheck
   npm run lint
   npm run ctf:smoke
   npm run ctf:autonomous:smoke
   npm run ctf:research:smoke
   npm run build
   ```

7. Commit dengan pesan yang jelas.
8. Buka pull request dan jelaskan perubahan serta cara pengujiannya.

## Aturan keamanan

- Jangan commit `.env`, `.env.local`, `.data`, upload, laporan challenge, API
  key, token, cookie, atau kredensial database.
- Jangan menambahkan bypass autentikasi, CAPTCHA, paywall, atau rate limit.
- Jangan menambahkan endpoint publik yang mengeksekusi perintah tanpa
  allowlist dan konfirmasi operator.
- Perlakukan halaman web, output tool, dan nama file sebagai data tidak
  tepercaya.
- Jangan mengubah klaim portofolio, sertifikat, atau prestasi tanpa bukti.

## Gaya kode

- TypeScript strict dan komponen React yang kecil.
- Pertahankan pola yang sudah ada di `src/`.
- Hindari dependency baru jika fungsi dapat diselesaikan dengan yang sudah ada.
- Sertakan penanganan error yang jujur; jangan menampilkan hasil palsu.

## Lisensi kontribusi

Dengan mengirim pull request, Anda setuju kontribusi dilisensikan di bawah
MIT License yang sama dengan proyek ini.
