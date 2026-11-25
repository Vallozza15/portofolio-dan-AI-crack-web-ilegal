import { WebLab } from "@/components/ctf/web-lab";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getSettings } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Web Security Lab" };

export default async function WebPage() {
  await requirePageAuth();
  const settings = await getSettings();
  return <WebLab allowPrivateHttp={settings.system.allowPrivateHttp} />;
}
