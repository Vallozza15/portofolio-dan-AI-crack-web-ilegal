import { CryptoWorkbench } from "@/components/ctf/crypto-workbench";
import { requirePageAuth } from "@/lib/ctf/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cryptography Lab" };

export default async function CryptoPage() {
  await requirePageAuth();
  return <CryptoWorkbench />;
}
