import { WorkspaceView } from "@/components/ctf/workspace";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getSettings, listChallenges, listFiles, listToolRuns } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Challenge Workspace" };

export default async function WorkspacePage() {
  await requirePageAuth();
  const [challenges, files, toolRuns, settings] = await Promise.all([
    listChallenges(),
    listFiles(),
    listToolRuns(),
    getSettings(),
  ]);
  return (
    <WorkspaceView
      challenges={challenges}
      files={files}
      toolRuns={toolRuns}
      maxUploadMb={settings.system.maxUploadMb}
      sandboxEnabled={settings.system.sandboxEnabled}
      hostToolsEnabled={settings.system.hostToolsEnabled}
    />
  );
}
