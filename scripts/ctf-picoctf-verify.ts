import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local verification for the picoCTF/picoGym configuration layer.
 * Environment overrides must happen before any CTF module is imported.
 */

async function main() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `ctf-picoctf-${randomUUID()}`));
  const legacyDataDir = path.join(workspace, "legacy-data");
  process.env.CTF_WORKSPACE_ROOT = workspace;
  process.env.CTF_DATA_DIR = legacyDataDir;
  process.env.CTF_PICOCTF_MODE = "1";
  process.env.CTF_PICOCTF_STRICT_ENDPOINTS = "1";
  process.env.CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION = "1";
  process.env.CTF_PICOCTF_ALLOWED_HOSTS = "demo.picoctf.net,second.picoctf.net";
  process.env.CTF_PICOCTF_ALLOWED_PORTS = "1234,8080";

  try {
    const { detectPicoctfCategory, picoctfCategoryLabel } = await import(
      "../src/lib/ctf/picoctf/categories"
    );
    const { authorizePicoGymEndpoint, commandTouchesNetwork, picoGymConfigSummary } = await import(
      "../src/lib/ctf/picoctf/network"
    );
    const { ensureChallengeWorkspace, challengeWorkspacePaths } = await import(
      "../src/lib/ctf/picoctf/workspace"
    );
    const { authorizeRemoteEndpoint } = await import("../src/lib/ctf/autonomous/config");
    const { understandChallenge } = await import(
      "../src/lib/ctf/autonomous/universal-understanding"
    );
    const { getUploadDir, resolveStoredFilePath } = await import("../src/lib/ctf/store");

    console.log("picoCTF / picoGym configuration verification");

    const expectedCategories = [
      ["Cryptography", "cryptography"],
      ["Forensics", "forensics"],
      ["General Skills", "general-skills"],
      ["Reverse Engineering", "reverse-engineering"],
      ["Web Exploitation", "web-exploitation"],
      ["Binary Exploitation", "binary-exploitation"],
    ] as const;
    for (const [label, category] of expectedCategories) {
      assert.equal(detectPicoctfCategory(`${label} challenge`), category, `kategori ${label}`);
    }
    assert.equal(picoctfCategoryLabel("web-exploitation"), "Web Exploitation");

    const understanding = understandChallenge({
      title: "picoCTF picoGym Web Exploitation",
      description: "A practice challenge from the official picoCTF platform.",
    });
    assert.equal(understanding.platformCategory, "web-exploitation");
    assert.equal(understanding.category, "web-security");
    assert.ok(
      understanding.classificationEvidence.some((item) => item.evidence === "kategori platform"),
      "bukti kategori platform harus tercatat",
    );

    const first = await ensureChallengeWorkspace("challenge-a", { title: "A" });
    const second = await ensureChallengeWorkspace("challenge-b", { title: "B" });
    assert.notEqual(first.challengeDir, second.challengeDir, "workspace per challenge harus berbeda");
    assert.equal(challengeWorkspacePaths("challenge-a").challengeDir, first.challengeDir);
    const manifest = JSON.parse(await readFile(first.manifestPath, "utf8")) as { challengeId: string };
    assert.equal(manifest.challengeId, "challenge-a");
    assert.ok(first.challengeDir.startsWith(workspace), "workspace harus berada di root yang dikonfigurasi");

    const legacyDir = path.join(legacyDataDir, "uploads");
    const legacyFile = path.join(legacyDir, "old-attachment.txt");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(legacyFile, "legacy", "utf8");
    assert.equal(getUploadDir(), workspace, "upload baru harus memakai workspace root");
    assert.equal(resolveStoredFilePath("old-attachment.txt"), legacyFile, "file lama harus tetap terbaca");
    assert.equal(
      resolveStoredFilePath("new-attachment.txt"),
      path.join(workspace, "new-attachment.txt"),
      "file baru harus di-resolve di workspace root",
    );
    assert.throws(() => resolveStoredFilePath("../escape.txt"), /Path file tidak valid/);

    const allowed = authorizePicoGymEndpoint("demo.picoctf.net", 1234);
    assert.equal(allowed.ok, true, allowed.reason);
    const unknownHost = authorizePicoGymEndpoint("unknown.example.org", 1234);
    assert.equal(unknownHost.ok, false);
    const unknownPort = authorizePicoGymEndpoint("demo.picoctf.net", 9999);
    assert.equal(unknownPort.ok, false);

    const generic = authorizeRemoteEndpoint("second.picoctf.net", 8080);
    assert.equal(generic.ok, true, generic.reason);
    assert.equal(authorizeRemoteEndpoint("unknown.example.org", 8080).ok, false);

    assert.equal(commandTouchesNetwork("nc demo.picoctf.net 1234"), true);
    assert.equal(commandTouchesNetwork("strings /analysis/00_file"), false);

    const summary = picoGymConfigSummary();
    assert.equal(summary.modeEnabled, true);
    assert.equal(summary.strictEndpoints, true);
    assert.equal(summary.requireNetworkConfirmation, true);
    assert.equal(summary.authorizedHostCount, 2);
    assert.deepEqual(summary.credentialSources, []);

    console.log("✓ 6 kategori picoCTF terdeteksi");
    console.log("✓ klasifikasi memakai label platform sebagai bukti");
    console.log("✓ workspace per challenge terpisah dan manifest valid");
    console.log("✓ upload lama tetap terbaca dan traversal ditolak");
    console.log("✓ endpoint tidak terdaftar ditolak");
    console.log("✓ port tidak terdaftar ditolak");
    console.log("✓ deteksi perintah jaringan bekerja");
    console.log("✓ ringkasan konfigurasi tidak memuat kredensial");
    console.log(`RESULT=PASS workspace=${workspace}`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
