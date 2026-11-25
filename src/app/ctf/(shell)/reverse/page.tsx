import { LabWorkbench } from "@/components/ctf/lab-workbench";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getLabData } from "@/lib/ctf/lab-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reverse Engineering" };

export default async function ReversePage() {
  await requirePageAuth();
  const data = await getLabData();
  return (
    <LabWorkbench
      category="reverse"
      eyebrow="REVERSE ENGINEERING"
      title="Static executable analysis"
      description="Parse ELF dan PE secara statis: header, section, entropi, import, simbol, mitigasi keamanan, dan indikasi packing. Binary tidak dieksekusi di host."
      guidance={[
        "Periksa arsitektur dan bitness sebelum membaca lebih jauh.",
        "Entropi section > 7.2 sering menandakan packing/enkripsi.",
        "Import menunjukkan kemampuan binary; bukan bukti perilaku.",
        "Cari string yang menyerupai flag atau URL.",
        "Analisis dinamis hanya lewat sandbox Docker terisolasi.",
      ]}
      files={data.files}
      challenges={data.challenges}
      maxUploadMb={data.maxUploadMb}
    />
  );
}
