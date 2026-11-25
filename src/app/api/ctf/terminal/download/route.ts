import { guard, errorResponse } from "@/lib/ctf/api";
import { readTerminalArtifact } from "@/lib/ctf/terminal";

export const dynamic = "force-dynamic";

/** Downloads a file generated inside the per-session Kali container. */
export async function GET(request: Request) {
  const blocked = await guard(request, "terminal-download", 60);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const sessionId = (url.searchParams.get("sessionId") || "").trim();
    const filePath = url.searchParams.get("path") || "";
    if (!sessionId || sessionId.length > 120) throw new Error("sessionId tidak valid.");
    const artifact = await readTerminalArtifact(sessionId, filePath);
    return new Response(new Uint8Array(artifact.data), {
      headers: {
        "Content-Type": artifact.mime,
        "Content-Disposition": `attachment; filename="${artifact.name}"`,
        "Content-Length": String(artifact.data.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
