import type { Achievement, GameTrophy } from "@/types";
import { asset } from "@/lib/assets";

/**
 * Hanya hasil yang punya bukti di arsip pribadi yang dicantumkan di sini.
 * Partisipasi tidak pernah disajikan sebagai kemenangan, dan tanggal yang
 * belum terbaca dari dokumen dibiarkan kosong.
 */
export const achievements: Achievement[] = [
  {
    id: "lks-provinsi-riau-2024",
    title: "LKS Tingkat Provinsi Riau 2024",
    result: "Pertama",
    resultNote: "tingkat provinsi",
    badge: "Penghargaan · juara 1",
    type: "award",
    description:
      "Meraih Juara I bidang Teknologi Keamanan Siber (Cyber Security) pada Lomba Kompetensi Siswa (LKS) Tingkat Provinsi Riau Tahun 2024. Sertifikat diterbitkan Disdik Provinsi Riau dengan nomor 400.3.5.4/DISDIK/31/2024/6357, tertanggal 31 Mei 2024.",
    details: ["Bidang: Cyber Security", "Tingkat: Provinsi Riau", "Tahun: 2024"],
    date: "2024-05-31",
    certificateUrl: asset("/images/achievements/lks-provinsi-riau-2024-juara-1.jpg"),
    image: {
      src: asset("/images/achievements/lks-provinsi-riau-2024-juara-1.jpg"),
      alt: "Sertifikat Juara I LKS Tingkat Provinsi Riau 2024 bidang Teknologi Keamanan Siber atas nama M. Vallozza Vito",
      width: 1600,
      height: 1130,
    },
    imageFit: "contain",
  },
  {
    id: "pcr-third-place",
    title: "PCR HACK BATTLE 2024",
    result: "Ketiga",
    resultNote: "tingkat daerah",
    badge: "Penghargaan · juara 3",
    type: "award",
    description:
      "Meraih Juara III pada PCR HACK BATTLE 2024 dengan tema “Cyber Security Awareness for Youth Generation”. Sertifikat nomor 0063.11/STF/PCR/2024 menjadi bukti resminya.",
    details: ["Keamanan Siber", "PCR HACK BATTLE 2024", "Tema: Cyber Security Awareness"],
    date: "2024",
    certificateUrl: asset("/images/achievements/pcr-hack-battle-2024-juara-3.jpg"),
    image: {
      src: asset("/images/achievements/pcr-hack-battle-2024-juara-3.jpg"),
      alt: "Sertifikat Juara III PCR HACK BATTLE 2024 atas nama M. Vallozza Vito",
      width: 1280,
      height: 933,
    },
    imageFit: "contain",
  },
  {
    id: "lks-national",
    title: "LKS Tingkat Nasional 2024",
    result: "Peserta",
    resultNote: "tingkat nasional",
    badge: "Partisipasi · nasional",
    type: "participation",
    description:
      "Mengikuti LKS tingkat nasional bidang Keamanan Siber bersama kontingen provinsi. Dicatat sebagai partisipasi — bukan peringkat atau kemenangan tingkat nasional.",
    details: ["Bidang: Keamanan Siber", "Tingkat: Nasional (SMK)", "Dokumentasi: foto tim"],
    date: "2024",
    certificateUrl: null,
    image: {
      src: asset("/images/achievements/lksn-2024-tim-keamanan-siber.jpg"),
      alt: "Foto bersama tim Keamanan Siber di LKS Nasional 2024",
      width: 1280,
      height: 960,
    },
    imageFit: "cover",
  },
  {
    id: "cisco-computer-hardware-basics",
    title: "Cisco Networking Academy",
    result: "Terverifikasi",
    resultNote: "Computer Hardware Basics",
    badge: "Sertifikasi · kursus",
    type: "certification",
    description:
      "Menyelesaikan kursus Computer Hardware Basics di Cisco Networking Academy dan memperoleh badge terverifikasi. Kredensial ini melengkapi dasar perangkat keras yang saya pelajari di TKJ.",
    details: ["Cisco Networking Academy", "Computer Hardware Basics", "Badge terverifikasi"],
    date: null,
    certificateUrl: asset("/images/achievements/cisco-computer-hardware-basics.jpg"),
    image: {
      src: asset("/images/achievements/cisco-computer-hardware-basics.jpg"),
      alt: "Badge terverifikasi Cisco Networking Academy untuk kursus Computer Hardware Basics",
      width: 1600,
      height: 1600,
    },
    imageFit: "contain",
  },
];

const mclTrophies: GameTrophy[] = [
  {
    team: "Team.MR'upin",
    src: asset("/images/achievements/mcl-team-mrupin.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim Team.MR'upin",
    width: 1520,
    height: 720,
  },
  {
    team: "Team.aduell",
    src: asset("/images/achievements/mcl-team-aduell.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim Team.aduell",
    width: 1520,
    height: 720,
  },
  {
    team: "Team.Villain",
    src: asset("/images/achievements/mcl-team-villain.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim Team.Villain",
    width: 1520,
    height: 720,
  },
  {
    team: "pace jatoh",
    src: asset("/images/achievements/mcl-pace-jatoh.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim pace jatoh",
    width: 1520,
    height: 720,
  },
  {
    team: "Team.ZinLay",
    src: asset("/images/achievements/mcl-team-zinlay.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim Team.ZinLay",
    width: 1520,
    height: 720,
  },
  {
    team: "KELUARGA PARDI",
    src: asset("/images/achievements/mcl-keluarga-pardi.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim KELUARGA PARDI",
    width: 1520,
    height: 720,
  },
  {
    team: "OKEGASOKEGAS",
    src: asset("/images/achievements/mcl-okegasokegas.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim OKEGASOKEGAS",
    width: 1520,
    height: 720,
  },
  {
    team: "Sigma Skibidi",
    src: asset("/images/achievements/mcl-sigma-skibidi.png"),
    alt: "Tangkapan layar piala MCL E-Sports Mania dengan nama tim Sigma Skibidi",
    width: 1520,
    height: 720,
  },
];

export const gameAchievements: Achievement[] = [
  {
    id: "mcl-esports-mania",
    title: "MCL E-Sports Mania",
    result: "Juara",
    resultNote: "8 gelar tercatat",
    badge: "Prestasi game · Mobile Legends",
    type: "game",
    description:
      "Delapan gelar juara MCL E-Sports Mania di Mobile Legends: Bang Bang yang terdokumentasi lewat tangkapan layar piala. Setiap tangkapan layar mencantumkan nama tim yang berbeda.",
    details: ["Mobile Legends: Bang Bang", "MCL E-Sports Mania", "8 piala"],
    date: null,
    certificateUrl: null,
    image: null,
    trophies: mclTrophies,
  },
  {
    id: "mythic-rank",
    title: "Peringkat Mythic",
    result: "Mythic",
    resultNote: "ranked · akun Ultima_Tempest",
    badge: "Prestasi game · peringkat",
    type: "rank",
    description:
      "Mencapai peringkat Mythic di ranked Mobile Legends: Bang Bang pada akun •Ultima_Tempest•.",
    details: ["Mobile Legends: Bang Bang", "Peringkat: Mythic", "Akun: •Ultima_Tempest•"],
    date: null,
    certificateUrl: null,
    image: {
      src: asset("/images/achievements/mythic-rank-ultima-tempest.png"),
      alt: "Layar peringkat Mythic Mobile Legends: Bang Bang pada akun •Ultima_Tempest•",
      width: 1520,
      height: 720,
    },
    imageFit: "cover",
  },
];
