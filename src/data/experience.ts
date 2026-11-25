import type { Experience } from "@/types";

/**
 * Pengalaman dijelaskan sebagai pembelajaran, kerja lapangan, dan kegiatan organisasi.
 * Tidak ada tanggal, jabatan, promosi, atau posisi kepemimpinan yang dikarang.
 */
export const experiences: Experience[] = [
  {
    id: "dashnet",
    company: "Dashnet",
    role: "Magang di Penyedia Layanan Internet",
    type: "Kerja Lapangan · PKL",
    summary:
      "Kerja lapangan praktis di penyedia layanan internet — membantu konektivitas pelanggan, mempelajari alur penanganan gangguan, dan mengenal peralatan serat optik secara langsung.",
    highlights: [
      "Membantu menangani masalah Wi-Fi dan koneksi internet pelanggan.",
      "Mempelajari bagaimana koneksi diperiksa dan diperbaiki di lingkungan ISP yang sebenarnya.",
      "Mengenal peralatan serat optik dan prosedur perawatan standar.",
      "Mempelajari keselamatan kerja, kesehatan, dan norma profesional di tim teknis.",
    ],
    tools: ["Stripper serat optik", "Piller", "Splicer", "Sleeve"],
  },
  {
    id: "pramuka",
    company: "Pramuka",
    role: "Kegiatan Organisasi",
    type: "Organisasi siswa",
    summary:
      "Mengikuti kegiatan Pramuka yang membentuk disiplin, tanggung jawab, komunikasi, dan sisi praktis bekerja dalam tim.",
    highlights: [
      "Melatih koordinasi dan tanggung jawab bersama dalam kegiatan kelompok.",
      "Mengembangkan kebiasaan berkomunikasi melalui tugas berbasis tim.",
      "Membangun konsistensi dan disiplin melalui kegiatan yang terstruktur.",
    ],
    tools: ["Kerja Sama Tim", "Disiplin", "Komunikasi", "Tanggung Jawab"],
  },
];
