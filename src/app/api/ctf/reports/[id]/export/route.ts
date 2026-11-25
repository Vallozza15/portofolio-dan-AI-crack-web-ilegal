import { guard, errorResponse } from "@/lib/ctf/api";
import { markdownToPdf, reportFilename } from "@/lib/ctf/report";
import { getReport } from "@/lib/ctf/store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guard(request, "report-export", 40);
  if (blocked) return blocked;
  try {
    const { id } = await context.params;
    const report = await getReport(id);
    if (!report) return errorResponse(new Error("Laporan tidak ditemukan."), 404);
    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "md";
    if (format === "pdf") {
      const pdf = markdownToPdf(report.markdown, report.title, new Date(report.createdAt));
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${reportFilename(report.title, "pdf")}"`,
          "Content-Length": String(pdf.length),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return new Response(report.markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${reportFilename(report.title, "md")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
