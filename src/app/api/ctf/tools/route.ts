import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import { getSandboxStatus } from "@/lib/ctf/sandbox";
import { getToolStatuses, listHostToolProfiles } from "@/lib/ctf/tools";

export async function GET(request: Request) {
  const blocked = await guard(request, "tools-list", 60);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const [tools, sandbox] = await Promise.all([getToolStatuses(force), getSandboxStatus(force)]);
    return noStoreJson({ tools, sandbox, profiles: listHostToolProfiles() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
