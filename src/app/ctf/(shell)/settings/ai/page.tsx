import { AiSettingsView } from "@/components/ctf/ai-settings-view";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getPublicSettings } from "@/lib/ctf/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Settings" };

export default async function AiSettingsPage() {
  await requirePageAuth();
  const settings = await getPublicSettings();
  return <AiSettingsView settings={settings} />;
}
