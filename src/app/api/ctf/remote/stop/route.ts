import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { stopAutonomousRun } from "@/lib/ctf/autonomous/control";
import { remoteSSHConnectionManager } from "@/lib/ctf/autonomous/remote-ssh-connection-manager";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guard(request, "remote-stop", 60);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ sessionId?: string; disconnect?: boolean }>(request);
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) throw new Error("sessionId wajib diisi.");
    const stopped = stopAutonomousRun(sessionId);
    if (body.disconnect) await remoteSSHConnectionManager.disconnect(sessionId, "stop");
    return noStoreJson({ ok: true, stopped });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
