import { ReportsView } from "@/components/ctf/reports-view";
import { requirePageAuth } from "@/lib/ctf/auth";
import { listChallenges, listReports } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requirePageAuth();
  const [reports, challenges] = await Promise.all([listReports(), listChallenges()]);
  return <ReportsView reports={reports} challenges={challenges} />;
}
