import { buildLocalBundle, detectCategory } from "./analyzer";
import { getChallenge, listFiles } from "./store";
import type { Challenge, CtfCategory, FileAnalysis, LocalAnalysisBundle } from "./types";

export async function buildBundleForChallenge(
  challengeId: string,
  customFormat?: string,
): Promise<LocalAnalysisBundle | null> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return null;
  const files = await listFiles(challengeId);
  const analyses = files
    .map((file) => file.analysis)
    .filter((analysis): analysis is FileAnalysis => Boolean(analysis));
  return buildLocalBundle({ challenge, files: analyses, customFormat });
}

export async function buildBundleForFiles(input: {
  challengeId?: string;
  fileIds?: string[];
  title?: string;
  description?: string;
  category?: CtfCategory;
  flagFormat?: string;
  expectedFlag?: string;
  customFormat?: string;
  message?: string;
}): Promise<{ bundle?: LocalAnalysisBundle; challenge?: Challenge }> {
  const challenge = input.challengeId ? await getChallenge(input.challengeId) : null;
  const allFiles = await listFiles(challenge?.id);
  const selected = input.fileIds?.length
    ? allFiles.filter((file) => input.fileIds?.includes(file.id))
    : allFiles;
  const analyses = selected
    .map((file) => file.analysis)
    .filter((analysis): analysis is FileAnalysis => Boolean(analysis));

  if (challenge) {
    return {
      challenge,
      bundle: buildLocalBundle({
        challenge,
        files: analyses,
        customFormat: input.customFormat || challenge.flagFormat,
        message: input.message,
      }),
    };
  }

  if (!analyses.length) return {};
  const at = new Date().toISOString();
  const text = `${input.title || ""}\n${input.description || ""}`;
  const detected = detectCategory(text, analyses);
  const synthetic: Challenge = {
    id: "adhoc",
    title: input.title?.trim() || analyses[0].name || "Analisis ad-hoc",
    category: input.category || detected.category,
    description: input.description || "Analisis file tanpa challenge tersimpan.",
    difficulty: "unknown",
    flagFormat: input.flagFormat || "flag{...}",
    expectedFlag: input.expectedFlag,
    status: "UNSOLVED",
    tags: ["adhoc"],
    createdAt: at,
    updatedAt: at,
  };
  return {
    challenge: synthetic,
    bundle: buildLocalBundle({
      challenge: synthetic,
      files: analyses,
      customFormat: input.customFormat || synthetic.flagFormat,
      message: input.message,
    }),
  };
}
