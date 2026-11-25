import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { listToolRuns } from "@/lib/ctf/store";
import {
  execTerminal,
  getTerminalInfo,
  getTerminalStatus,
  resetTerminal,
  startTerminal,
} from "@/lib/ctf/terminal";

export const dynamic = "force-dynamic";

function sessionIdFrom(value: unknown): string {
  const id = String(value || "").trim();
  if (!id) throw new Error("sessionId wajib diisi.");
  if (id.length > 120) throw new Error("sessionId terlalu panjang.");
  return id;
}

export async function GET(request: Request) {
  const blocked = await guard(request, "terminal-status", 120);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const terminal = await getTerminalStatus();
    const session = sessionId ? await getTerminalInfo(sessionId) : null;
    const runs = sessionId ? await listToolRuns(sessionId) : [];
    const history = runs
      .filter((run) => run.tool === "kali")
      .slice(-100)
      .map((run) => ({
        id: run.id,
        command: run.args[0] || "",
        status: run.status,
        summary: run.summary,
        durationMs: run.durationMs,
        createdAt: run.createdAt,
        requestId: run.requestId,
        purpose: run.purpose,
        hypothesisId: run.hypothesisId,
        phase: run.phase,
        exitCode: run.exitCode,
      }));
    return noStoreJson({ terminal, session, history });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      action?: "start" | "exec" | "reset";
      sessionId?: string;
      command?: string;
      fileIds?: string[];
      timeoutMs?: number;
      requestId?: string;
      purpose?: string;
      hypothesisId?: string;
      phase?: string;
    }>(request);
    const action = body.action || "exec";
    const sessionId = sessionIdFrom(body.sessionId);
    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.map((id) => String(id)).slice(0, 20)
      : [];

    if (action === "start") {
      const blocked = await guard(request, "terminal-start", 20);
      if (blocked) return blocked;
      const session = await startTerminal(sessionId, fileIds);
      const terminal = await getTerminalStatus();
      return noStoreJson({ ok: true, terminal, session });
    }

    if (action === "reset") {
      const blocked = await guard(request, "terminal-reset", 20);
      if (blocked) return blocked;
      await resetTerminal(sessionId);
      return noStoreJson({ ok: true, session: null });
    }

    const blocked = await guard(request, "terminal-exec", 90);
    if (blocked) return blocked;
    const command = String(body.command || "").trim();
    if (!command) throw new Error("command wajib diisi.");
    const result = await execTerminal({
      sessionId,
      command,
      fileIds,
      timeoutMs: Number.isFinite(body.timeoutMs) ? Number(body.timeoutMs) : undefined,
      requestId: body.requestId,
      purpose: body.purpose,
      hypothesisId: body.hypothesisId,
      phase: body.phase,
    });
    const session = await getTerminalInfo(sessionId);
    return noStoreJson({ ok: result.status !== "blocked", session, result });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(request: Request) {
  const blocked = await guard(request, "terminal-reset", 20);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const sessionId = sessionIdFrom(url.searchParams.get("sessionId"));
    await resetTerminal(sessionId);
    return noStoreJson({ ok: true });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
