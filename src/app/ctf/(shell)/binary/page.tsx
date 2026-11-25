import { LabWorkbench } from "@/components/ctf/lab-workbench";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getLabData } from "@/lib/ctf/lab-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Binary Analysis" };

export default async function BinaryPage() {
  await requirePageAuth();
  const data = await getLabData();
  return (
    <LabWorkbench
      category="binary"
      eyebrow="BINARY ANALYSIS"
      title="Mitigations & exploitation surface"
      description="Ringkasan checksec statis (NX, PIE, canary, RELRO), import berbahaya, gadget sederhana, dan indikasi packing untuk challenge pwn edukasi."
      guidance={[
        "Catat mitigasi sebelum menyusun strategi eksploitasi.",
        "Import seperti gets/strcpy/printf memperbesar risiko.",
        "Gadget scan bersifat indikatif; validasi dengan disassembler.",
        "Tidak ada eksekusi payload otomatis di platform ini.",
        "Gunakan sandbox hanya untuk lab yang Anda miliki/otorisasi.",
      ]}
      files={data.files}
      challenges={data.challenges}
      maxUploadMb={data.maxUploadMb}
    />
  );
}
