import { LabWorkbench } from "@/components/ctf/lab-workbench";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getLabData } from "@/lib/ctf/lab-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Digital Forensics" };

export default async function ForensicsPage() {
  await requirePageAuth();
  const data = await getLabData();
  return (
    <LabWorkbench
      category="forensics"
      eyebrow="DIGITAL FORENSICS"
      title="Forensic artifact analysis"
      description="Identifikasi file, metadata, string, arsip, PCAP, PDF, dan data tertanam. Semua parsing dilakukan lokal dan hasilnya dapat dijadikan bukti."
      guidance={[
        "Periksa signature sebenarnya; jangan percaya ekstensi.",
        "Bandingkan hash dengan sumber resmi bila tersedia.",
        "Untuk PCAP, mulai dari protokol, DNS, dan HTTP host.",
        "Cari data setelah EOF (trailing bytes) dan file tertanam.",
        "Gunakan strings dengan filter kata kunci kredensial/flag.",
      ]}
      files={data.files}
      challenges={data.challenges}
      maxUploadMb={data.maxUploadMb}
    />
  );
}
