import { ResearchDashboard } from "@/components/ctf/research-dashboard";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getPublicResearchSettings } from "@/lib/ctf/research/settings";
import { listResearchSessions } from "@/lib/ctf/research/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Answer Discovery Engine" };

export default async function ResearchPage() {
  await requirePageAuth();
  const [sessions, settings] = await Promise.all([listResearchSessions(), getPublicResearchSettings()]);
  return <ResearchDashboard initialSessions={sessions} initialSettings={settings} />;
}
