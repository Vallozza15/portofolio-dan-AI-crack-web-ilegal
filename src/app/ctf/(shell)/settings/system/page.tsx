import { SystemSettingsView } from "@/components/ctf/system-settings-view";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getPublicSettings } from "@/lib/ctf/settings";
import { getStorageStats, listChallenges, listReports, listSessions } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Settings" };

export default async function SystemSettingsPage() {
  await requirePageAuth();
  const [settings, stats, challenges, sessions, reports] = await Promise.all([
    getPublicSettings(),
    getStorageStats(),
    listChallenges(),
    listSessions(),
    listReports(),
  ]);
  return (
    <SystemSettingsView
      settings={settings}
      storage={{
        dataDir: stats.dataDir,
        files: stats.files,
        bytes: stats.bytes,
        challenges: challenges.length,
        sessions: sessions.length,
        reports: reports.length,
      }}
    />
  );
}
