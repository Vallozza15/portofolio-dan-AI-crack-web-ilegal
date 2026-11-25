import { readFile, unlink } from "node:fs/promises";
import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import {
  audit,
  deleteFileRecord,
  getFileRecord,
  resolveStoredFilePath,
} from "@/lib/ctf/store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "file-get", 120);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const file = await getFileRecord(id);
    if (!file) return noStoreJson({ error: "File tidak ditemukan." }, { status: 404 });
    const url = new URL(request.url);
    if (url.searchParams.get("download") === "1") {
      const filePath = resolveStoredFilePath(file.storageName);
      const buffer = await readFile(filePath);
      const asciiName = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return noStoreJson({ file });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "file-delete", 30);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const file = await deleteFileRecord(id);
    if (!file) return noStoreJson({ error: "File tidak ditemukan." }, { status: 404 });
    try {
      const filePath = resolveStoredFilePath(file.storageName);
      await unlink(filePath);
    } catch {
      // The record is removed even if the physical file was already gone.
    }
    await audit("file.delete", file.originalName);
    return noStoreJson({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
