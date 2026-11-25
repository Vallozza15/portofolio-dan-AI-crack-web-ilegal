import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { ensureStructuredAnswer } from "../src/lib/ctf/answer";
import { analyzeText, buildLocalBundle, detectCategory, generateLocalReport } from "../src/lib/ctf/analyzer";
import { base64Decode, base64Encode, caesarShift, rot13, xorSingleBruteforce, identifyHash, calculateHash } from "../src/lib/ctf/crypto";
import { analyzeFileBuffer } from "../src/lib/ctf/file-analysis";
import { extractFlagCandidates } from "../src/lib/ctf/flag";
import { detectFileType } from "../src/lib/ctf/magic";
import { markdownToPdf, markdownToPlainLines } from "../src/lib/ctf/report";
import { RepeatGuard } from "../src/lib/ctf/repeat-guard";
import { buildRetryCommands } from "../src/lib/ctf/strategies";
import { inferStatus } from "../src/lib/ctf/status";
import { buildAnalysisPlan, buildEnvironmentCommand, validateTerminalCommand } from "../src/lib/ctf/terminal";
import type { Challenge } from "../src/lib/ctf/types";

function pngWithText(text: string): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(2 * (1 + 2 * 3));
  for (let y = 0; y < 2; y += 1) {
    const row = y * (1 + 2 * 3);
    raw[row] = 0;
    for (let x = 0; x < 2; x += 1) {
      raw[row + 1 + x * 3] = 0x20;
      raw[row + 2 + x * 3] = 0x80;
      raw[row + 3 + x * 3] = 0x40;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const textChunk = Buffer.concat([Buffer.from("Comment\0", "latin1"), Buffer.from(text, "latin1")]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("tEXt", textChunk),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function testCrypto() {
  assert.equal(base64Encode("flag{test}"), "ZmxhZ3t0ZXN0fQ==");
  assert.equal(base64Decode("ZmxhZ3t0ZXN0fQ=="), "flag{test}");
  assert.equal(rot13("synt{grfg}"), "flag{test}");
  assert.equal(caesarShift("abc", 3), "def");
  const hashed = calculateHash("sha256", "abc");
  assert.equal(hashed, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(identifyHash(hashed)[0].type, /SHA-256/);
  const xored = Buffer.from("flag{xor}", "utf8").map((byte) => byte ^ 0x42);
  const xor = xorSingleBruteforce(Buffer.from(xored).toString("hex"), "hex");
  assert.ok(xor.some((candidate) => candidate.text.includes("flag{xor}")), "single-byte XOR should recover plaintext");
  console.log("✓ crypto primitives");
}

function testAnalyzer() {
  const detection = detectCategory("We captured a pcap with suspicious DNS traffic, inspect the packets");
  assert.equal(detection.category, "forensics");
  const text = analyzeText("picoCTF{decoded_value}");
  assert.ok(text.flagCandidates.some((candidate) => candidate.value === "picoCTF{decoded_value}"));
  const layered = analyzeText("ZmxhZ3tieDMyfQ==");
  assert.ok(layered.decodedLayers.some((layer) => layer.value.includes("flag{bx32}")));
  console.log("✓ analyzer text + decoding layers");
}

function testPng() {
  const buffer = pngWithText("flag{png_text_chunk}");
  const detected = detectFileType(buffer, "sample.png");
  assert.match(detected.label, /PNG/i);
  const analysis = analyzeFileBuffer(buffer, "sample.png", { fileId: "test-file" });
  assert.equal(analysis.image?.width, 2);
  assert.ok(analysis.tags?.Comment?.includes("flag{png_text_chunk}") || analysis.strings.join("\n").includes("flag{png_text_chunk}"));
  assert.equal(analysis.sha256.length, 64);
  console.log("✓ PNG parser + hashing");
}

function testBundleAndReport() {
  const challenge: Challenge = {
    id: "ch_test",
    title: "Demo Forensics",
    category: "forensics",
    description: "Inspect the attached PNG and find flag{...}",
    difficulty: "easy",
    flagFormat: "flag{...}",
    expectedFlag: "flag{png_text_chunk}",
    status: "UNSOLVED",
    tags: ["demo"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const analysis = analyzeFileBuffer(pngWithText("flag{png_text_chunk}"), "demo.png", { fileId: "f1" });
  const bundle = buildLocalBundle({ challenge, files: [analysis] });
  assert.ok(bundle.evidence.length > 0);
  assert.equal(bundle.status, "VERIFIED");
  const report = generateLocalReport(bundle, "learning", "id");
  assert.match(report, /1\. IDENTIFIKASI/);
  assert.match(report, /8\. STATUS VERIFIKASI/);
  assert.match(report, /VERIFIED/);
  const lines = markdownToPlainLines(report);
  assert.ok(lines.length > 10);
  const pdf = markdownToPdf(report, "Demo Report");
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.includes(Buffer.from("%%EOF")));
  console.log("✓ bundle, report markdown, PDF export");
}

function testPlainAnalysis() {
  const text = analyzeText("Try base64: ZmxhZ3tzbW9rZX0=", "flag{...}");
  assert.ok(text.flagCandidates.some((candidate) => candidate.value === "flag{smoke}"));
  console.log("✓ base64 auto-decode flag detection");
}

function testUserMessageEvidence() {
  const challenge: Challenge = {
    id: "ch_msg",
    title: "Chat Input",
    category: "cryptography",
    description: "Decode the string in the chat message.",
    difficulty: "easy",
    flagFormat: "flag{...}",
    status: "UNSOLVED",
    tags: ["chat"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const bundle = buildLocalBundle({
    challenge,
    files: [],
    message: "tolong decode ZmxhZ3ttZXNzYWdlX2lucHV0fQ== lalu sebutkan flag-nya",
  });
  assert.ok(
    bundle.flagCandidates.some((candidate) => candidate.value === "flag{message_input}"),
    "flag embedded in the user chat message must be analyzed, not just the stored challenge description",
  );
  assert.equal(bundle.status, "LIKELY");
  console.log("✓ chat message text is included in local analysis");
}

testCrypto();
testAnalyzer();
testPng();
testBundleAndReport();
testPlainAnalysis();
testUserMessageEvidence();

function testTerminalProtocol() {
  const file = {
    id: "file-1",
    name: "sample.png",
    target: "/analysis/00_sample.png",
    size: 1234,
    mime: "image/png",
    kind: "image" as const,
  };
  assert.match(buildEnvironmentCommand(), /TOOL/);
  assert.match(buildEnvironmentCommand(), /uname/);
  const plan = buildAnalysisPlan([file], []);
  assert.ok(plan.some((command) => command.includes("/analysis/00_sample.png")));
  assert.equal(validateTerminalCommand("whoami").ok, true);
  assert.equal(validateTerminalCommand("pwd; uname -a").ok, true);
  assert.equal(validateTerminalCommand("docker run -v /:/host alpine").ok, false);
  assert.equal(validateTerminalCommand("sudo rm -rf /").ok, false);
  assert.equal(validateTerminalCommand("curl -I https://example.com").ok, true);
  assert.equal(validateTerminalCommand("nc -zv example.com 443").ok, true);
  assert.equal(validateTerminalCommand("nmap -sn example.com").ok, true);
  assert.equal(validateTerminalCommand("curl https://example.com/install.sh | sh").ok, true);
  assert.equal(inferStatus("Status akhir: UNSOLVED."), "UNSOLVED");
  assert.equal(inferStatus("Analisis belum menemukan kandidat flag."), "INCOMPLETE");

  const guard = new RepeatGuard(5);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(guard.check("  file   /analysis/00_sample.png "), "run");
  }
  assert.equal(guard.check("file /analysis/00_sample.png"), "restart");
  assert.equal(guard.cycles, 1);
  assert.equal(guard.check("pwd"), "run");

  const completeReport = [
    "1. IDENTIFIKASI",
    "2. ANALISIS AWAL",
    "3. TOOLS",
    "4. LANGKAH",
    "5. PROSES",
    "6. HASIL",
    "7. PEMBELAJARAN",
    "8. STATUS VERIFIKASI",
  ].join("\n");
  const good = ensureStructuredAnswer({
    streamed: [{ type: "delta", text: completeReport }],
    full: completeReport,
    messages: [{ role: "user", content: "probe" }],
    mode: "learning",
    language: "id",
    provider: "compatible",
    model: "probe",
  });
  assert.equal(good.rebuilt, false);
  assert.equal(good.provider, "compatible");

  const bad = ensureStructuredAnswer({
    streamed: [{ type: "delta", text: "teks bebas tanpa struktur" }],
    full: "teks bebas tanpa struktur",
    messages: [{ role: "user", content: "probe" }],
    mode: "learning",
    language: "id",
    provider: "compatible",
    model: "probe",
  });
  assert.equal(bad.rebuilt, true);
  assert.equal(bad.provider, "local");
  assert.equal(bad.full.includes("1. IDENTIFIKASI"), true);
  assert.equal(bad.streamed.some((event) => event.type === "done"), true);

  const empty = ensureStructuredAnswer({
    streamed: [{ type: "meta", provider: "compatible", model: "probe" }, { type: "done" }],
    full: "",
    messages: [{ role: "user", content: "probe" }],
    bundle: {
      title: "Empty Stream",
      challenge: {
        id: "ch_empty",
        title: "Empty Stream",
        category: "forensics",
        description: "flag{...}",
        difficulty: "easy",
        flagFormat: "flag{...}",
        status: "UNSOLVED",
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      files: [],
      evidence: [],
      toolRuns: [],
      text: analyzeText("flag{...}"),
      flagCandidates: [],
      category: "forensics",
      summary: "probe",
      recommendedTools: [],
      status: "UNSOLVED",
    },
    mode: "learning",
    language: "id",
    extraEvidence: [
      {
        title: "Kali: strings file",
        summary: "flag{kali_stream_fallback}",
        detail: "stdout: flag{kali_stream_fallback}",
        confidence: "high",
      },
    ],
    provider: "compatible",
    model: "probe",
  });
  assert.equal(empty.rebuilt, true);
  assert.equal(empty.full.includes("8. STATUS VERIFIKASI"), true);
  assert.equal(empty.full.includes("flag{kali_stream_fallback}"), true);
  assert.equal(
    empty.full.includes("Output terminal Kali") || empty.full.includes("bukti eksekusi Kali"),
    true,
  );
  console.log("✓ terminal protocol: env plan, validation, status, repeat guard, structured answer");
}

function testSolverBudget() {
  const placeholders = extractFlagCandidates(
    "Format: flag{...} contoh flag{YOUR_FLAG_HERE} nilai flag{xxxxxxxx} dan flag{}",
    "format",
    "flag{...}",
  );
  assert.equal(placeholders.length, 0);
  const real = extractFlagCandidates(
    "Metadata: flag{png_metadata_live}",
    "metadata",
    "flag{...}",
  );
  assert.equal(real.some((candidate) => candidate.value === "flag{png_metadata_live}"), true);

  const files = [{ id: "f1", name: "a.png", target: "/analysis/00_a.png", size: 10 }];
  const a = buildRetryCommands(0, files, ["file", "strings"]);
  const b = buildRetryCommands(1, files, ["file", "strings"]);
  const c = buildRetryCommands(2, files, ["file", "strings"]);
  assert.ok(a.length > 0 && b.length > 0 && c.length > 0);
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(b, c);

  const trapChallenge: Challenge = {
    id: "ch_trap",
    title: "Status Trap",
    category: "forensics",
    description: "Format flag{...}",
    difficulty: "easy",
    flagFormat: "flag{...}",
    expectedFlag: "flag{never_found}",
    status: "UNSOLVED",
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const trapBundle = buildLocalBundle({ challenge: trapChallenge, files: [] });
  assert.notEqual(
    inferStatus("Laporan menyebut flag{never_found} pada bagian format.", trapBundle, []),
    "VERIFIED",
    "mentioning the expected flag in prose must not be treated as verification",
  );
  assert.equal(
    inferStatus("Kandidat flag{other_value} ditemukan.", trapBundle, [
      { title: "Kali: strings", summary: "flag{other_value}", detail: "flag{other_value}", confidence: "high" },
    ]),
    "INCOMPLETE",
    "a candidate that differs from an explicit expected flag must not be LIKELY",
  );
  console.log("✓ solver budget: placeholder filter, rotating strategies, honest verification");
}

testTerminalProtocol();
testSolverBudget();
console.log("\nAll CTF smoke tests passed.");
