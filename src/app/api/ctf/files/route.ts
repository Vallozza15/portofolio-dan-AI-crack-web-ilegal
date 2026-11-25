import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import { analyzeFileBuffer } from "@/lib/ctf/file-analysis";
import { sanitizeFilename } from "@/lib/ctf/file-utils";
import { detectFileType } from "@/lib/ctf/magic";
import { attachmentRelativePath, ensureChallengeWorkspace } from "@/lib/ctf/picoctf/workspace";
import {
  addFileRecord,
  audit,
  getChallenge,
  getSettings,
  getUploadDir,
  listFiles,
  newId,
  nowIso,
} from "@/lib/ctf/store";
import type { StoredFile } from "@/lib/ctf/types";

const ALLOWED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff", "tif", "ico", "svg",
  "wav", "mp3", "flac", "ogg", "m4a", "aac", "wma", "mp4", "webm", "mkv", "mov", "avi",
  "pdf", "txt", "log", "md", "csv", "json", "xml", "html", "htm", "js", "ts", "py",
  "c", "cpp", "cc", "h", "hpp", "cs", "java", "go", "rs", "rb", "php", "sh", "ps1",
  "pcap", "pcapng", "cap", "pcap.gz",
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "apk",
  "elf", "exe", "dll", "so", "bin", "dat", "o", "dex", "class", "img", "raw",
  "vhd", "vmdk", "mem", "dmp", "sqlite", "db", "pst", "eml", "msg",
  "docx", "xlsx", "pptx", "doc", "xls", "ppt", "rtf",
]);

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz")) return "tgz";
  return lower.includes(".") ? lower.split(".").pop() || "" : "";
}

export async function GET(request: Request) {
  const blocked = await guard(request, "files-list", 120);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const challengeId = url.searchParams.get("challengeId") || undefined;
    const files = await listFiles(challengeId);
    return noStoreJson({ files: files.slice(0, 200) });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const blocked = await guard(request, "files-upload", 20);
  if (blocked) return blocked;
  let writtenPath: string | null = null;
  try {
    const settings = await getSettings();
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) throw new Error("Field 'file' wajib berisi file.");
    const originalName = sanitizeFilename(upload.name || "upload.bin");
    const extension = extensionOf(originalName);
    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error(`Ekstensi .${extension || "(kosong)"} tidak diizinkan.`);
    }
    const maxBytes = settings.system.maxUploadMb * 1024 * 1024;
    if (upload.size <= 0) throw new Error("File kosong.");
    if (upload.size > maxBytes) {
      throw new Error(`Ukuran file melebihi batas ${settings.system.maxUploadMb} MB.`);
    }
    const buffer = Buffer.from(await upload.arrayBuffer());
    if (!buffer.length) throw new Error("File kosong.");
    const detected = detectFileType(buffer, originalName);
    const challengeIdRaw = form.get("challengeId");
    const challengeId =
      typeof challengeIdRaw === "string" && challengeIdRaw.trim() ? challengeIdRaw.trim() : undefined;
    const fileId = newId("file");
    const storageName = challengeId
      ? attachmentRelativePath(challengeId, `${fileId}.${extension}`)
      : `${fileId}.${extension}`;
    const uploadDir = getUploadDir();
    if (challengeId) {
      const challenge = await getChallenge(challengeId);
      await ensureChallengeWorkspace(challengeId, {
        title: challenge?.title,
        source: challenge?.source,
      });
    }
    writtenPath = path.join(uploadDir, storageName);
    await mkdir(path.dirname(writtenPath), { recursive: true });
    await writeFile(writtenPath, buffer, { mode: 0o600 });
    const analysis = analyzeFileBuffer(buffer, originalName, { fileId, includeQr: true });
    const file: StoredFile = {
      id: fileId,
      name: originalName,
      originalName,
      extension,
      mime: upload.type || "application/octet-stream",
      size: buffer.length,
      sha256: analysis.sha256,
      md5: analysis.md5,
      sha1: analysis.sha1,
      magic: detected.label || analysis.magic,
      storageName,
      createdAt: nowIso(),
      challengeId: typeof challengeId === "string" && challengeId ? challengeId : undefined,
      analysis,
    };
    await addFileRecord(file);
    await audit(
      "file.upload",
      `${originalName} (${buffer.length} B, ${detected.label}) sha256=${analysis.sha256.slice(0, 16)}…`,
    );
    return noStoreJson({ file }, { status: 201 });
  } catch (error) {
    if (writtenPath) {
      try {
        await unlink(writtenPath);
      } catch {
        // Ignore cleanup errors.
      }
    }
    return errorResponse(error, 400);
  }
}
