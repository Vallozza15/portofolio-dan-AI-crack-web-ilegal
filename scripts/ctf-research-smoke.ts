import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResearchSource } from "../src/lib/ctf/research/types";

async function main() {
const temp = await mkdtemp(path.join(os.tmpdir(), "ctf-research-smoke-"));
process.env.CTF_DATA_DIR = path.join(temp, "data");
process.env.CTF_WORKSPACE_ROOT = path.join(temp, "workspace");

try {
  const { buildIdentity, normalizeText } = await import("../src/lib/ctf/research/identity");
  const { buildSearchQueries, toGitHubQuery } = await import("../src/lib/ctf/research/queries");
  const { scoreSource } = await import("../src/lib/ctf/research/matching");
  const { crossValidate, formatFinalAnswer } = await import("../src/lib/ctf/research/validation");
  const { extractFlagCandidates } = await import("../src/lib/ctf/flag");
  const settingsModule = await import("../src/lib/ctf/research/settings");
  const sessionStore = await import("../src/lib/ctf/research/store");

  assert.equal(normalizeText("PicoCTF 2024 — Write-Up!"), "picoctf 2024 write up");

  const identity = buildIdentity({
    title: "Basic File Exploitation",
    platform: "picoCTF",
    category: "Forensics",
    description:
      "A basic file exploitation challenge where the flag is hidden in metadata. Use strings, exiftool, and a pcap from picoCTF 2024 to solve it. picoCTF{test_flag_123}",
    artifacts: ["challenge.pcap", "flag.txt"],
  });
  assert.equal(identity.platform, "picoCTF");
  assert.equal(identity.flag_format, "picoCTF{...}");
  assert.equal(identity.year, "2024");
  assert.ok(identity.title_variants.includes("basic-file-exploitation"));
  assert.ok(identity.description_tokens.includes("exiftool"));

  const queries = buildSearchQueries(identity);
  assert.ok(queries.length >= 10);
  assert.ok(queries.some((query) => query.startsWith("site:github.com")));
  assert.ok(!toGitHubQuery(queries.find((query) => query.startsWith("site:")) || "").includes("site:"));

  const { resultsFromSeedUrls } = await import("../src/lib/ctf/research/providers");
  const seeds = resultsFromSeedUrls([
    "https://example.com/writeup",
    "http://127.0.0.1:8080/internal",
    "javascript:alert(1)",
  ]);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].provider, "operator");

  const strong = scoreSource(identity, {
    title: "Basic File Exploitation writeup",
    text: "picoCTF 2024 forensics basic file exploitation hidden metadata strings exiftool pcap txt picoCTF{test_flag_123}",
    description: "basic file exploitation hidden metadata strings exiftool pcap txt",
    flags: [{ value: "picoCTF{test_flag_123}", format: "picoCTF", confidence: 0.9 }],
  });
  assert.ok(strong.score >= 85, `strong score=${strong.score}`);
  assert.ok(["exact", "strong"].includes(strong.tier));

  const titleOnlyIdentity = buildIdentity({ title: "Basic File Exploitation" });
  const titleOnly = scoreSource(titleOnlyIdentity, {
    title: "Basic File Exploitation",
    text: "Unrelated article about gardening and cooking recipes.",
    description: "",
    flags: [],
  });
  assert.ok(titleOnly.score < 70, `title-only score=${titleOnly.score}`);

  const flags = extractFlagCandidates("picoCTF{abc_123} flag{your_flag_here}", "test");
  assert.ok(flags.some((flag) => flag.value === "picoCTF{abc_123}"));
  assert.ok(!flags.some((flag) => flag.value.includes("your_flag_here")));

  const makeSource = (
    url: string,
    author: string,
    score: number,
    value: string,
  ): ResearchSource => ({
    url,
    finalUrl: url,
    title: "Basic File Exploitation writeup",
    author,
    platform: "picoCTF",
    challengeName: "Basic File Exploitation",
    description: "",
    methodology: ["Jalankan strings pada file.", "Ekstrak metadata dengan exiftool.", "Flag muncul dari keluaran perintah."],
    codeSnippets: [],
    candidateFlags: [{ value, format: "picoCTF", confidence: 0.9 }],
    priority: 2,
    accessible: true,
    retrievedAt: new Date().toISOString(),
    provider: "github",
    kind: "issue",
    match: {
      score,
      tier: score >= 85 ? "strong" : "potential",
      reasons: [],
      breakdown: {},
    },
    untrustedNotice: "",
    instructionLikeContent: false,
  });

  const single = crossValidate([makeSource("https://a.example/writeup", "author-a", 90, "picoCTF{one_123}")], identity);
  assert.equal(single.status, "SOURCE CONFIRMED");
  assert.equal(single.answer, "picoCTF{one_123}");

  const multi = crossValidate(
    [
      makeSource("https://a.example/writeup", "author-a", 95, "picoCTF{one_123}"),
      makeSource("https://b.example/writeup", "author-b", 90, "picoCTF{one_123}"),
    ],
    identity,
  );
  assert.equal(multi.status, "MULTI-SOURCE CONFIRMED");

  const conflict = crossValidate(
    [
      makeSource("https://a.example/writeup", "author-a", 95, "picoCTF{one_123}"),
      makeSource("https://b.example/writeup", "author-b", 90, "picoCTF{two_456}"),
    ],
    identity,
  );
  assert.equal(conflict.status, "CONFLICTING");
  assert.equal(conflict.answer, "");
  const conflictAnswer = formatFinalAnswer(identity, conflict, [makeSource("https://a.example/writeup", "author-a", 95, "picoCTF{one_123}")], "Public Write-up Discovery");
  assert.ok(conflictAnswer.formatted.includes("Tidak ada flag statis yang disepakati"));
  assert.ok(!conflictAnswer.formatted.includes("STATUS: VERIFIED"));

  const potential = crossValidate([makeSource("https://c.example/notes", "author-c", 75, "picoCTF{three_789}")], identity);
  assert.equal(potential.status, "HIGH CONFIDENCE");
  assert.notEqual(potential.status, "VERIFIED");

  const official = crossValidate(
    [makeSource("https://a.example/writeup", "author-a", 90, "picoCTF{one_123}")],
    identity,
    { flag: "picoCTF{one_123}", evidence: "Server accepted the flag during authorized submission." },
  );
  assert.equal(official.status, "VERIFIED");

  const empty = crossValidate([], identity);
  assert.equal(empty.status, "UNVERIFIED");

  const answer = formatFinalAnswer(identity, multi, [makeSource("https://a.example/writeup", "author-a", 95, "picoCTF{one_123}")], "Public Write-up Discovery");
  for (const header of ["CHALLENGE:", "PLATFORM:", "ANSWER:", "STATUS:", "DISCOVERY METHOD:", "SOLUTION:", "SOURCE:", "ADDITIONAL SOURCES:", "VERIFICATION:"]) {
    assert.ok(answer.formatted.includes(header), `missing ${header}`);
  }

  await settingsModule.saveResearchSettings({
    provider: "brave",
    enabled: true,
    apiKey: "secret-research-key",
    cx: "cx-1",
  });
  const publicSettings = await settingsModule.getPublicResearchSettings();
  assert.equal(publicSettings.hasKey, true);
  assert.ok(!JSON.stringify(publicSettings).includes("secret-research-key"));
  const config = await settingsModule.getResearchConfig();
  assert.equal(config.apiKey, "secret-research-key");

  await sessionStore.saveResearchSession({
    id: "research_smoke",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    input: { title: "Basic File Exploitation", platform: "picoCTF", category: "", url: "", description: "" },
    identity,
    queries,
    results: [],
    sources: [],
    candidates: multi.candidates,
    status: multi.status,
    answer,
    fallbackReason: "",
    events: [],
  });
  const stored = await sessionStore.getResearchSession("research_smoke");
  assert.ok(stored);
  assert.equal(stored.status, "MULTI-SOURCE CONFIRMED");

  console.log("✓ identitas, query, dan normalisasi bekerja");
  console.log("✓ pencocokan menolak bukti berbasis judul saja");
  console.log("✓ ekstraksi flag menolak placeholder");
  console.log("✓ status VERIFIED hanya dengan bukti validator resmi");
  console.log("✓ multi-source, source-confirmed, conflict, dan high-confidence terbedakan");
  console.log("✓ format jawaban lengkap");
  console.log("✓ kunci penyedia terenkripsi dan tidak muncul pada public settings");
  console.log("RESULT=PASS");
} finally {
  await rm(temp, { recursive: true, force: true });
}
}

void main();
