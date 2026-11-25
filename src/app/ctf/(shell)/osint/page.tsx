import { OsintLab } from "@/components/ctf/osint-lab";
import { requirePageAuth } from "@/lib/ctf/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "OSINT Lab" };

export default async function OsintPage() {
  await requirePageAuth();
  return <OsintLab />;
}
