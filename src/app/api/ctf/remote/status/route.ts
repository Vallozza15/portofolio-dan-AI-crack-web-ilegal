import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import { remoteSSHConnectionManager } from "@/lib/ctf/autonomous/remote-ssh-connection-manager";
import { getChallengeState, getRemoteConnection } from "@/lib/ctf/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guard(request, "remote-status", 120);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const sessionId = String(url.searchParams.get("sessionId") || "").trim();
    if (!sessionId) throw new Error("sessionId wajib diisi.");
    const connection = await remoteSSHConnectionManager.getStatus(sessionId);
    const persisted = await getRemoteConnection(sessionId);
    const state = await getChallengeState(sessionId);
    return noStoreJson({
      connection: {
        ...connection,
        lastCommand: connection.lastCommand ? "[perintah terakhir disembunyikan]" : undefined,
      },
      persisted: persisted
        ? {
            status: persisted.status,
            cwd: persisted.cwd,
            lastExitCode: persisted.lastExitCode,
            lastSeenAt: persisted.lastSeenAt,
          }
        : null,
      challenge: state
        ? {
            stage: state.stage,
            finalStatus: state.finalStatus,
            verifiedFlag: state.finalStatus === "VERIFIED" || state.finalStatus === "COMPLETED" ? state.verifiedFlag : undefined,
            hintCount: state.hints.length,
            unresolvedCount: state.unresolvedTasks.length,
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
