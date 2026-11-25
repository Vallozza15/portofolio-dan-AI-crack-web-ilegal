import { safeFetch } from "../http";

/**
 * Bounded, read-only discovery for CyLab Academy challenge endpoints.
 *
 * It never bypasses authentication or Cloudflare. If the official challenge
 * API requires an operator session, the engine says so and continues with the
 * local Kali netcat driver instead of pretending that a source was found.
 */
export interface CyLabResearchResult {
  reachable: boolean;
  authRequired: boolean;
  notes: string[];
}

export async function researchCyLabChallenge(
  host: string,
  port: number,
  language: "id" | "en",
): Promise<CyLabResearchResult> {
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    return { reachable: false, authRequired: false, notes: [] };
  }
  const notes: string[] = [];
  const official = "https://learn.cylabacademy.org/";
  let reachable = false;
  let authRequired = false;

  try {
    const page = await safeFetch(official, {
      timeoutMs: 8_000,
      maxBytes: 300_000,
      previewChars: 20_000,
    });
    reachable = page.status === 200;
    notes.push(
      reachable
        ? language === "id"
          ? `Sumber resmi learn.cylabacademy.org dapat diakses (HTTP ${page.status}).`
          : `Official learn.cylabacademy.org source is reachable (HTTP ${page.status}).`
        : language === "id"
          ? `Sumber resmi learn.cylabacademy.org mengembalikan HTTP ${page.status}; tidak ada bypass yang dilakukan.`
          : `Official learn.cylabacademy.org returned HTTP ${page.status}; no bypass was attempted.`,
    );
  } catch (error) {
    notes.push(
      language === "id"
        ? `Gagal mengakses learn.cylabacademy.org: ${error instanceof Error ? error.message : String(error)}`
        : `Could not reach learn.cylabacademy.org: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const api = await safeFetch("https://learn.cylabacademy.org/api/challenges/", {
      timeoutMs: 8_000,
      maxBytes: 300_000,
      previewChars: 20_000,
    });
    if (api.status === 401 || api.status === 403) {
      authRequired = true;
      notes.push(
        language === "id"
          ? `API detail challenge CyLab memerlukan sesi operator (HTTP ${api.status}); tidak ada login otomatis atau bypass. Berikan judul/deskripsi challenge jika ingin riset publik yang lebih spesifik.`
          : `CyLab challenge detail API requires an operator session (HTTP ${api.status}); no automatic login or bypass. Provide the challenge title/description for more specific public research.`,
      );
    } else if (api.status === 200) {
      notes.push(
        language === "id"
          ? `API challenge publik dapat dibaca (HTTP 200); identitas endpoint ${host}:${port} tetap diverifikasi dari output terminal.`
          : `Public challenge API is readable (HTTP 200); endpoint identity ${host}:${port} is still verified from terminal output.`,
      );
    } else {
      notes.push(
        language === "id"
          ? `API challenge mengembalikan HTTP ${api.status}; analisis dilanjutkan dari output terminal Kali.`
          : `Challenge API returned HTTP ${api.status}; analysis continues from Kali terminal output.`,
      );
    }
  } catch (error) {
    notes.push(
      language === "id"
        ? `Pemeriksaan API CyLab gagal: ${error instanceof Error ? error.message : String(error)}`
        : `CyLab API check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { reachable, authRequired, notes: notes.slice(0, 4) };
}
