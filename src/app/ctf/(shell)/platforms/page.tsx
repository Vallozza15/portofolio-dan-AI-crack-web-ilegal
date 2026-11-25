import { PlatformDiscovery, type PlatformView } from "@/components/ctf/platform-discovery";
import { requirePageAuth } from "@/lib/ctf/auth";
import { listPlatformAdapters } from "@/lib/ctf/platforms/registry";
import { listPlatformConnections } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform Discovery" };

export default async function PlatformsPage() {
  await requirePageAuth();
  const [adapters, connections] = await Promise.all([
    Promise.resolve(listPlatformAdapters()),
    listPlatformConnections(),
  ]);
  const platforms: PlatformView[] = adapters.map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    officialUrl: adapter.officialUrl,
    supportsOfficialApi: adapter.supportsOfficialApi,
    requiresUserSession: adapter.requiresUserSession,
    capabilities: adapter.capabilities,
  }));
  return <PlatformDiscovery platforms={platforms} connections={connections} />;
}
