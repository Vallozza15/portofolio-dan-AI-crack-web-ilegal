import { LabWorkbench } from "@/components/ctf/lab-workbench";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getLabData } from "@/lib/ctf/lab-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Steganography Lab" };

export default async function StegoPage() {
  await requirePageAuth();
  const data = await getLabData();
  return (
    <LabWorkbench
      category="steganography"
      eyebrow="STEGANOGRAPHY LAB"
      title="Hidden data inspection"
      description="Analisis LSB PNG, chunk, EXIF, trailing data, audio WAV/MP3/FLAC, QR, dan file tertanam. Temuan diberi tingkat keyakinan, bukan klaim mutlak."
      guidance={[
        "Mulai dari metadata dan chunk sebelum LSB.",
        "LSB hanya bermakna jika menghasilkan teks terstruktur.",
        "Periksa data setelah IEND/EOF untuk payload tambahan.",
        "Untuk audio, bandingkan sampel dan cari trailing bytes.",
        "Decode QR dari gambar asli, bukan screenshot terkompresi.",
      ]}
      files={data.files}
      challenges={data.challenges}
      maxUploadMb={data.maxUploadMb}
    />
  );
}
