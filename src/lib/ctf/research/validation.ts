import type {
  ChallengeIdentity,
  CrossValidationResult,
  OfficialValidation,
  ResearchCandidate,
  ResearchFinalAnswer,
  ResearchSource,
  ResearchStatus,
} from "./types";

function provenanceKey(source: ResearchSource): string {
  let host = "source";
  try {
    host = new URL(source.url).hostname.toLowerCase();
  } catch {
    // Keep fallback label.
  }
  return `${host}|${source.author || source.title || source.url}`.slice(0, 240);
}

function relevantSources(sources: ResearchSource[]): ResearchSource[] {
  return sources
    .filter((source) => source.accessible && source.match && source.match.score >= 70)
    .sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0));
}

export function crossValidate(
  sources: ResearchSource[],
  identity: ChallengeIdentity,
  official?: OfficialValidation,
): CrossValidationResult {
  const relevant = relevantSources(sources);
  const byFlag = new Map<string, ResearchCandidate>();

  for (const source of relevant) {
    const exact = (source.match?.score || 0) >= 85;
    for (const flag of source.candidateFlags.slice(0, 5)) {
      const entry =
        byFlag.get(flag.value) ||
        {
          value: flag.value,
          sources: [],
          exactSources: [],
          independentProvenance: [],
          highestConfidence: 0,
          officialValidated: false,
        };
      if (!entry.sources.includes(source.url)) entry.sources.push(source.url);
      if (exact && !entry.exactSources.includes(source.url)) entry.exactSources.push(source.url);
      const key = provenanceKey(source);
      if (!entry.independentProvenance.includes(key)) entry.independentProvenance.push(key);
      entry.highestConfidence = Math.max(entry.highestConfidence, flag.confidence);
      byFlag.set(flag.value, entry);
    }
  }

  if (official?.flag && official.evidence.trim().length >= 8 && byFlag.has(official.flag.trim())) {
    const entry = byFlag.get(official.flag.trim());
    if (entry) entry.officialValidated = true;
  }

  const candidates = [...byFlag.values()].sort((a, b) => {
    if (a.officialValidated !== b.officialValidated) return a.officialValidated ? -1 : 1;
    if (a.exactSources.length !== b.exactSources.length) return b.exactSources.length - a.exactSources.length;
    if (a.independentProvenance.length !== b.independentProvenance.length) {
      return b.independentProvenance.length - a.independentProvenance.length;
    }
    if (a.highestConfidence !== b.highestConfidence) return b.highestConfidence - a.highestConfidence;
    return a.value.localeCompare(b.value);
  });

  const top = candidates[0];
  const runnerUp = candidates[1];
  const reasons: string[] = [];
  let status: ResearchStatus = "UNVERIFIED";
  let answer = "";

  if (!top) {
    reasons.push("Tidak ada kandidat flag yang ditemukan pada sumber dengan skor kecocokan minimal 70.");
  } else if (top.officialValidated) {
    status = "VERIFIED";
    answer = top.value;
    reasons.push("Kandidat cocok dengan bukti validator resmi yang diberikan operator.");
  } else if (
    runnerUp &&
    top.exactSources.length >= 1 &&
    runnerUp.exactSources.length === top.exactSources.length &&
    top.value !== runnerUp.value
  ) {
    status = "CONFLICTING";
    reasons.push("Dua kandidat dengan dukungan sumber kuat yang sama ditemukan; tidak ada yang dipromosikan.");
  } else if (top.independentProvenance.length >= 2 && top.exactSources.length >= 2) {
    status = "MULTI-SOURCE CONFIRMED";
    answer = top.value;
    reasons.push("Flag sama muncul pada beberapa sumber exact-match yang saling independen.");
  } else if (top.exactSources.length >= 1) {
    status = "SOURCE CONFIRMED";
    answer = top.value;
    reasons.push("Flag muncul pada satu write-up dengan kecocokan kuat (skor minimal 85).");
  } else {
    status = "HIGH CONFIDENCE";
    answer = top.value;
    reasons.push("Flag hanya muncul pada sumber dengan kecocokan potensial; belum ada konfirmasi kuat.");
  }

  const multi = candidates.length > 1 ? ` ${candidates.length} kandidat berbeda ditemukan.` : "";
  const officialText = official?.flag
    ? "Validator resmi: bukti operator diberikan dan sudah dicocokkan secara lokal, bukan dipanggil ulang oleh aplikasi."
    : "Validator resmi: tidak dipanggil; status apa pun di bawah VERIFIED bukan konfirmasi server CTF.";
  const verification = [
    `${relevant.length} sumber memenuhi ambang kecocokan 70.`,
    top ? `Kandidat terbaik memiliki ${top.exactSources.length} sumber kuat dan ${top.independentProvenance.length} provenansi independen.` : "Tidak ada kandidat.",
    ...reasons,
    officialText,
    multi.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return { status, answer, candidates: candidates.slice(0, 10), reasons, verification };
}

export function formatFinalAnswer(
  identity: ChallengeIdentity,
  cross: CrossValidationResult,
  sources: ResearchSource[],
  discoveryMethod: ResearchFinalAnswer["discoveryMethod"],
): ResearchFinalAnswer {
  const supporting = sources.filter(
    (source) => cross.answer && source.candidateFlags.some((flag) => flag.value === cross.answer),
  );
  const usable = sources.filter((source) => source.accessible);
  const primary =
    supporting.find((source) => source.methodology.length > 0) ||
    supporting[0] ||
    usable.find((source) => source.methodology.length > 0) ||
    usable[0] ||
    sources[0];
  const additionalSources = sources
    .filter(
      (source) =>
        source.url !== primary?.url && source.accessible && (source.match?.score || 0) >= 70,
    )
    .slice(0, 4)
    .map((source) => source.url);
  const steps = (primary?.methodology || []).filter(
    (step) => !cross.answer || !step.includes(cross.answer),
  );
  const solution = steps.length
    ? steps.slice(0, 4)
    : ["Metode eksplisit tidak tersedia pada sumber yang berhasil diambil; lihat sumber asli untuk detailnya."];

  const answerLine = cross.answer
    ? cross.answer
    : cross.status === "CONFLICTING" && cross.candidates.length
      ? `Tidak ada flag statis yang disepakati. Kandidat publik: ${cross.candidates.slice(0, 4).map((item) => item.value).join(", ")}. Ikuti langkah SOLUTION pada instance challenge Anda; kandidat tersebut bukan bukti validator resmi.`
      : "Tidak ditemukan kandidat yang dapat dilaporkan.";

  const formatted = [
    `CHALLENGE: ${identity.challenge_title}`,
    `PLATFORM: ${identity.platform || "Tidak dinyatakan"}`,
    `ANSWER: ${answerLine}`,
    `STATUS: ${cross.status}`,
    `DISCOVERY METHOD: ${discoveryMethod}`,
    "SOLUTION:",
    ...solution.map((step, index) => `${index + 1}. ${step}`),
    `SOURCE: ${primary?.url || "Tidak tersedia"}`,
    `ADDITIONAL SOURCES: ${additionalSources.length ? additionalSources.join("\n") : "Tidak tersedia"}`,
    `VERIFICATION: ${cross.verification}${cross.answer && discoveryMethod === "Public Write-up Discovery" ? " Catatan: flag di write-up adalah flag instance penulis; jalankan langkah SOLUTION pada instance Anda dan gunakan flag yang dikembalikan server challenge." : ""}`,
  ].join("\n");

  return {
    challenge: identity.challenge_title,
    platform: identity.platform || "Tidak dinyatakan",
    answer: cross.answer,
    status: cross.status,
    discoveryMethod,
    solution,
    source: primary?.url || "",
    additionalSources,
    verification: cross.verification,
    formatted,
  };
}
