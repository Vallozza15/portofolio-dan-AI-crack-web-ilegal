import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { buildBundleForChallenge } from "@/lib/ctf/bundle";
import { buildReportDraft } from "@/lib/ctf/report";
import {
  audit,
  createReport,
  getSession,
  listMessages,
  listReports,
} from "@/lib/ctf/store";

export async function GET(request: Request) {
  const blocked = await guard(request, "reports-list", 90);
  if (blocked) return blocked;
  try {
    return noStoreJson({ reports: await listReports() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "reports-create", 20);
  if (blocked) return blocked;
  try {
    const body = await readJson<{
      challengeId?: string;
      sessionId?: string;
      title?: string;
      mode?: "learning" | "expert" | "hint";
      language?: "id" | "en";
    }>(request);
    let challengeId = body.challengeId;
    if (!challengeId && body.sessionId) {
      const session = await getSession(body.sessionId);
      challengeId = session?.challengeId;
    }
    if (!challengeId) throw new Error("Pilih challenge yang memiliki lampiran/analisis untuk dibuat laporan.");
    const bundle = await buildBundleForChallenge(challengeId);
    if (!bundle) throw new Error("Challenge tidak ditemukan.");
    const draft = buildReportDraft(
      bundle,
      body.mode || "learning",
      body.language === "en" ? "en" : "id",
    );
    // A finished agent answer already contains real terminal evidence and the
    // solver timing. Prefer it over the generic bundle report when available.
    const timedMessage = body.sessionId
      ? (await listMessages(body.sessionId))
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" &&
              message.content.includes("Waktu pengerjaan solver"),
          )
      : undefined;
    const report = await createReport({
      challengeId,
      sessionId: body.sessionId,
      title: body.title?.trim() || draft.title,
      category: draft.category,
      markdown: timedMessage?.content || draft.markdown,
      status: timedMessage?.status || draft.status,
    });
    await audit("report.create", `${report.title} (${report.status})`);
    return noStoreJson({ report }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
