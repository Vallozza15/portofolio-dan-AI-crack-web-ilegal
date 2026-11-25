import type { NavItem } from "@/types";

export const profile = {
  name: "Muhammad Vallozza Vito",
  brand: "VALLOZZA",
  role: "Mahasiswa Informatika · Penggemar Keamanan Siber · Penjelajah Teknologi",
  shortRole: "Mahasiswa Informatika",
  websiteTitle: "Vallozza — Portofolio Pribadi",
  description:
    "Portofolio pribadi Muhammad Vallozza Vito — mahasiswa Informatika yang mendalami keamanan siber, jaringan komputer, pemrograman, dan teknologi baru.",
  intro:
    "Saya Muhammad Vallozza Vito, mahasiswa Informatika yang tertarik pada keamanan siber, jaringan komputer, pemrograman, dan teknologi baru.",
  headline: [
    { text: "Membangun", italic: false },
    { text: "ide.", italic: true },
    { text: "Menjelajahi", italic: false },
    { text: "teknologi.", italic: true },
    { text: "Menjaga masa depan", italic: false },
    { text: "digital.", italic: true },
  ],
  availability: {
    available: true,
    label: "Sedang belajar & berkarya",
  },
  /**
   * Tambahkan email publik saat Anda siap menerima pesan.
   * Sampai saat itu, tampilan kontak tidak pernah berpura-pura alamat email sudah ada.
   */
  email: null as string | null,
  /**
   * Letakkan PDF di public/cv/muhammad-vallozza-vito-cv.pdf lalu isi path ini.
   * Hero akan tetap menampilkan status nonaktif yang jelas selama nilainya null.
   */
  cvUrl: null as string | null,
  bio: [
    "Saya mahasiswa Informatika di Universitas Pamulang dengan latar belakang Teknik Komputer dan Jaringan (TKJ). Fokus saya berada di pertemuan antara keamanan defensif, operasi jaringan, dan dasar-dasar perangkat lunak.",
    "Saya suka memahami bagaimana sistem berperilaku ketika ada masalah: koneksi terputus, jaringan salah konfigurasi, atau ancaman yang lolos dari pendeteksian. Rasa ingin tahu itu membentuk cara saya belajar — mulai dari dasar, menguji ide lewat praktik, dan mencatat apa yang saya temukan.",
    "Saat ini saya memperkuat dasar C++, Python, SQL, dan jaringan sambil mengeksplorasi bagaimana kecerdasan artifisial dapat membantu deteksi dan respons ancaman siber.",
  ],
  focusAreas: [
    "Keamanan Siber",
    "Jaringan Komputer",
    "Pengembangan Perangkat Lunak",
    "Kecerdasan Artifisial",
    "Sistem Operasi",
    "Riset Teknologi",
  ],
  heroTags: ["Keamanan Siber", "Jaringan", "Informatika"],
  footerTagline: "Menjelajahi Teknologi. Membangun Kemungkinan.",
  copyrightName: "Muhammad Vallozza Vito",
};

export const navItems: NavItem[] = [
  { label: "Beranda", href: "#home", id: "home" },
  { label: "Tentang", href: "#about", id: "about" },
  { label: "Pengalaman", href: "#experience", id: "experience" },
  { label: "Keahlian", href: "#skills", id: "skills" },
  { label: "Proyek", href: "#projects", id: "projects" },
  { label: "Pencapaian", href: "#achievements", id: "achievements" },
  { label: "Galeri", href: "#gallery", id: "gallery" },
  { label: "Kontak", href: "#contact", id: "contact" },
];

export const footerNav = ["Beranda", "Tentang", "Pengalaman", "Proyek", "Galeri", "Kontak"];

export const education = [
  {
    id: "unpam",
    institution: "Universitas Pamulang",
    shortName: "UNPAM",
    program: "S1 Informatika",
    level: "Jenjang Sarjana",
    description:
      "Mempelajari dasar-dasar ilmu komputer sekaligus membangun keterampilan praktis dalam pemrograman, basis data, arsitektur komputer, dan sistem operasi.",
    coursework: [
      "Dasar-Dasar Pemrograman",
      "C++ & Python",
      "Sistem Basis Data & MySQL",
      "Arsitektur Komputer",
      "Sistem Operasi",
      "Aljabar Boolean",
    ],
    period: null,
  },
  {
    id: "smkn1",
    institution: "SMKN 1 Pekanbaru",
    shortName: "SMKN 1",
    program: "Teknik Komputer dan Jaringan (TKJ)",
    level: "Sekolah Menengah Kejuruan (SMK)",
    description:
      "Membangun dasar praktis dalam jaringan komputer, perangkat jaringan, dan dasar-dasar keamanan siber, termasuk praktik kerja lapangan di penyedia layanan internet.",
    coursework: [
      "Jaringan Komputer",
      "Perangkat Jaringan",
      "Dasar-Dasar Keamanan Siber",
      "Operasional Layanan Internet",
    ],
    period: null,
  },
];
