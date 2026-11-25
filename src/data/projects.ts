import type { Project } from "@/types";

/**
 * Hanya karya akademik dan pembelajaran yang sudah terverifikasi yang dicantumkan.
 * Tidak ada repositori atau demo langsung yang dikarang: tautan tetap null sampai diisi.
 */
export const projects: Project[] = [
  {
    slug: "ai-cyber-threat-detection",
    index: "01",
    title: "Peran Kecerdasan Artifisial dalam Deteksi dan Respons Ancaman Siber",
    subtitle: "Makalah riset akademik",
    description:
      "Proyek riset akademik yang membahas bagaimana kecerdasan artifisial dapat mendukung deteksi dan respons ancaman siber.",
    intro:
      "Makalah akademik kelompok yang menelaah posisi kecerdasan artifisial dalam keamanan defensif — dari mengenali perilaku anomali hingga membantu respons insiden yang lebih cepat dan terarah.",
    role: "Ikut menulis · makalah kelompok akademik",
    status: "Riset akademik",
    topics: [
      "Kecerdasan Artifisial",
      "Keamanan Siber",
      "Deteksi Ancaman",
      "Respons Insiden",
      "Riset Akademik",
    ],
    facts: [
      { label: "Format", value: "Makalah akademik" },
      { label: "Fokus", value: "Pertahanan siber berbantuan AI" },
      { label: "Bidang", value: "Keamanan Siber" },
      { label: "Tahun", value: "Belum diterbitkan" },
    ],
    sections: [
      {
        heading: "Apa yang dibahas dalam makalah",
        body: [
          "Makalah ini menelaah peran kecerdasan artifisial dalam membantu tim keamanan mendeteksi dan merespons ancaman. AI diposisikan sebagai kemampuan pendukung — yang dapat mengolah data keamanan dalam jumlah besar dan menunjukkan pola yang layak diperiksa analis manusia.",
          "Pembahasannya menghubungkan konsep dasar keamanan siber dengan peluang dan batas deteksi cerdas, termasuk pentingnya penilaian manusia dalam mengambil keputusan respons.",
        ],
      },
      {
        heading: "Cakupan, disampaikan dengan jujur",
        body: [
          "Ini adalah proyek riset dan penulisan akademik, bukan platform deteksi yang sudah diterapkan. Tidak ada klaim tolok ukur model atau hasil produksi di sini.",
          "Nilai karya ini terletak pada cara merumuskan masalah: bagaimana AI dapat memperkuat deteksi dan respons, serta apa yang perlu dipertimbangkan tim keamanan sebelum mempercayainya.",
        ],
      },
    ],
    links: { github: null, demo: null },
    artwork: "intelligence",
    accent: "#8B5CF6",
  },
  {
    slug: "candi-prambanan",
    index: "02",
    title: "Mengenal Candi Prambanan Indonesia",
    subtitle: "Proyek warisan budaya berbahasa Inggris",
    description:
      "Proyek akademik berbahasa Inggris yang memperkenalkan makna budaya dan sejarah Candi Prambanan.",
    intro:
      "Proyek kelompok yang memperkenalkan Candi Prambanan kepada audiens berbahasa Inggris — sejarah, filosofi, pengakuan UNESCO, dan nilai budayanya yang tetap relevan.",
    role: "Kontributor kelompok · riset, dokumentasi & presentasi video",
    status: "Proyek kelompok akademik",
    topics: [
      "Warisan Budaya",
      "Candi Prambanan",
      "UNESCO",
      "Presentasi Bahasa Inggris",
      "Riset & Dokumentasi",
    ],
    facts: [
      { label: "Format", value: "Presentasi & video kelompok" },
      { label: "Bahasa", value: "Inggris" },
      { label: "Subjek", value: "Candi Prambanan" },
      { label: "Tahun", value: "Belum diterbitkan" },
    ],
    sections: [
      {
        heading: "Cerita di balik proyek",
        body: [
          "Candi Prambanan adalah salah satu situs budaya paling penting di Indonesia. Proyek ini menelusuri makna filosofis candi, konteks sejarahnya, dan pengakuan yang diterimanya sebagai bagian dari lanskap Warisan Dunia UNESCO.",
          "Sebagai kerja kelompok, tim membagi tanggung jawab riset dan produksi, menyusun narasi, menyiapkan materi presentasi, lalu menyampaikan materi akhir dalam bahasa Inggris.",
        ],
      },
      {
        heading: "Kontribusi saya",
        body: [
          "Saya meneliti filosofi Prambanan, mengumpulkan informasi tentang pengakuan UNESCO-nya, serta berkontribusi pada dokumentasi dan presentasi video.",
          "Proyek ini berada di persimpangan antara cerita budaya dan komunikasi — menyajikan warisan Indonesia secara jelas kepada audiens internasional.",
        ],
      },
    ],
    links: { github: null, demo: null },
    artwork: "heritage",
    accent: "#E7B778",
  },
  {
    slug: "programming-fundamentals",
    index: "03",
    title: "Dasar-Dasar Pemrograman",
    subtitle: "C++, Python & pemecahan masalah logis",
    description:
      "Kumpulan latihan pemrograman menggunakan C++, Python, dan pemecahan masalah secara logis.",
    intro:
      "Kumpulan program kecil yang terus bertambah sambil mempelajari dasar-dasar — alur kendali, percabangan, aritmetika, dan kebiasaan memecah masalah menjadi langkah-langkah.",
    role: "Latihan belajar mandiri",
    status: "Kumpulan latihan",
    topics: [
      "C++",
      "Python",
      "Alur Kendali",
      "Pemecahan Masalah",
      "Logika Program",
    ],
    facts: [
      { label: "Bahasa", value: "C++ & Python" },
      { label: "Fokus", value: "Dasar pemrograman" },
      { label: "Format", value: "Kumpulan latihan" },
      { label: "Tahun", value: "Belajar berkelanjutan" },
    ],
    sections: [
      {
        heading: "Apa yang saya latih",
        body: [
          "Latihannya mencakup pengecekan bilangan ganjil dan genap, perhitungan luas lingkaran, percabangan bersarang, switch-case di C++, dan match-case di Python.",
          "Simulasi kasir sederhana menyatukan konsep-konsep itu: membaca input, menghitung total, menangani pembayaran, kembalian, dan dana yang tidak cukup.",
        ],
      },
      {
        heading: "Bagaimana karya ini disajikan",
        body: [
          "Ini adalah latihan belajar, bukan aplikasi produksi. Semuanya mewakili proses membangun model mental yang andal tentang alur program dan pemecahan masalah.",
          "Tujuannya bukan seberapa rumit setiap program, melainkan menulis logika yang lebih jelas, memberi nama dengan baik, dan belajar menelusuri kesalahan.",
        ],
      },
    ],
    links: { github: null, demo: null },
    artwork: "code",
    accent: "#5EEAD4",
  },
  {
    slug: "mysql-database-practice",
    index: "04",
    title: "Latihan Basis Data MySQL",
    subtitle: "Skema, tabel & operasi SQL",
    description:
      "Latihan membuat basis data, mengelola tabel, dan menjalankan operasi SQL.",
    intro:
      "Latihan langsung menggunakan basis data: membuat skema, mendefinisikan tabel dan kolom, memasukkan data, menanyakan data, dan membiasakan diri dengan prompt MySQL.",
    role: "Latihan belajar mandiri",
    status: "Latihan belajar",
    topics: [
      "MySQL",
      "SQL",
      "Perancangan Basis Data",
      "Pengelolaan Tabel",
      "Operasi Data",
    ],
    facts: [
      { label: "Alat", value: "MySQL" },
      { label: "Fokus", value: "Basis data relasional" },
      { label: "Format", value: "Latihan terpandu" },
      { label: "Tahun", value: "Belajar berkelanjutan" },
    ],
    sections: [
      {
        heading: "Apa yang saya latih",
        body: [
          "Membuat basis data dan tabel, memilih tipe kolom, serta mengolah kolom seperti id, nama, nomor mahasiswa, dan program studi.",
          "Saya juga berlatih memasukkan dan meninjau data, mengganti nama kolom atau tabel, serta memahami bagaimana prompt MySQL merespons setiap perintah.",
        ],
      },
      {
        heading: "Arah selanjutnya",
        body: [
          "Entri ini mendokumentasikan latihan SQL dasar, bukan aplikasi produksi. Langkah berikutnya adalah perancangan skema yang lebih kuat, join, dan performa kueri.",
        ],
      },
    ],
    links: { github: null, demo: null },
    artwork: "database",
    accent: "#60A5FA",
  },
];

export function getProject(slug: string) {
  return projects.find((project) => project.slug === slug);
}

export function getAdjacentProject(slug: string) {
  const index = projects.findIndex((project) => project.slug === slug);
  if (index === -1) return null;
  const next = projects[(index + 1) % projects.length];
  return next;
}
