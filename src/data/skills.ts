import type { SkillCategory } from "@/types";

/**
 * Keahlian dicantumkan sebagai bidang studi dan latihan — tanpa persentase,
 * tanpa nilai kemahiran yang dikarang, dan tanpa klaim sertifikasi.
 */
export const skillCategories: SkillCategory[] = [
  {
    id: "programming",
    label: "Pemrograman",
    kicker: "Bangun logikanya",
    description:
      "Latihan dasar dengan bahasa terstruktur, alur kendali, dan pemecahan masalah. Fokusnya adalah kejelasan sebelum kerumitan.",
    skills: ["C++", "Python", "SQL", "MySQL"],
  },
  {
    id: "cybersecurity",
    label: "Keamanan Siber",
    kicker: "Berpikir defensif",
    description:
      "Dasar-dasar keamanan yang dibentuk oleh pengalaman kompetisi dan riset akademik tentang deteksi dan respons.",
    skills: [
      "Dasar-Dasar Keamanan Siber",
      "Dasar Keamanan Jaringan",
      "Konsep Deteksi Ancaman",
    ],
  },
  {
    id: "networking",
    label: "Jaringan",
    kicker: "Ikuti sinyalnya",
    description:
      "Pengalaman praktis dari studi TKJ dan kerja lapangan di ISP: konektivitas, jaringan pelanggan, dan dasar serat optik.",
    skills: [
      "Jaringan Komputer",
      "Penanganan Gangguan Wi-Fi",
      "Dasar Serat Optik",
    ],
  },
  {
    id: "technology",
    label: "Teknologi",
    kicker: "Pahami sistemnya",
    description:
      "Pengetahuan praktis tentang sistem sehari-hari, perangkat keras, dan alat yang dipakai untuk belajar, menguji, dan berkarya.",
    skills: [
      "Windows 11",
      "Perangkat Keras Komputer",
      "Sistem Operasi",
      "Emulasi Android",
    ],
  },
];
