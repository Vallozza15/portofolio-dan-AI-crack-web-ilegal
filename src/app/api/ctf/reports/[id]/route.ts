import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import { audit, deleteReport, getReport } from "@/lib/ctf/store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "report-get", 90);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const report = await getReport(id);
    if (!report) return noStoreJson({ error: "Laporan tidak ditemukan." }, { status: 404 });
    return noStoreJson({ report });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "report-delete", 20);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const removed = await deleteReport(id);
    if (!removed) return noStoreJson({ error: "Laporan tidak ditemukan." }, { status: 404 });
    await audit("report.delete", id);
    return noStoreJson({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
