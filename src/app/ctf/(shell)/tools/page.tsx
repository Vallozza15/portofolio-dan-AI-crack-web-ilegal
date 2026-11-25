import { ToolsConsole } from "@/components/ctf/tools-console";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getSandboxStatus, listSandboxProfiles } from "@/lib/ctf/sandbox";
import { getSettings, listFiles, listToolRuns } from "@/lib/ctf/store";
import { getToolStatuses, listHostToolProfiles } from "@/lib/ctf/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrated Tools" };

export default async function ToolsPage() {
  await requirePageAuth();
  const [tools, sandbox, files, toolRuns, settings] = await Promise.all([
    getToolStatuses(),
    getSandboxStatus(),
    listFiles(),
    listToolRuns(),
    getSettings(),
  ]);
  return (
    <ToolsConsole
      tools={tools}
      sandbox={sandbox}
      profiles={listHostToolProfiles()}
      sandboxProfiles={listSandboxProfiles()}
      files={files}
      toolRuns={[...toolRuns].reverse()}
      hostToolsEnabled={settings.system.hostToolsEnabled}
      sandboxEnabled={settings.system.sandboxEnabled}
    />
  );
}
