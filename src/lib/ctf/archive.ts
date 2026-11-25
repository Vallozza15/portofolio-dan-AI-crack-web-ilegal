import { gunzipSync, inflateRawSync } from "node:zlib";
import { extractFlagCandidates } from "./flag";
import { isPrintableText, safePreview } from "./file-utils";
import type { ArchiveEntry, ArchiveListing, FlagCandidate } from "./types";

const METHOD_NAMES: Record<number, string> = {
  0: "Store",
  8: "Deflate",
  9: "Deflate64",
  12: "BZip2",
  14: "LZMA",
  93: "Zstandard",
  95: "XZ",
  99: "AES",
};

export interface ArchiveResult {
  listing: ArchiveListing;
  previews: Array<{ name: string; text: string }>;
  flags: FlagCandidate[];
  trailing?: { offset: number; length: number; preview: string };
}

export function parseZip(buffer: Buffer): ArchiveResult {
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buffer.lastIndexOf(eocdSignature);
  if (eocd < 0) throw new Error("EOCD ZIP tidak ditemukan. Arsip mungkin terpotong atau memakai ZIP64/spanned archive.");
  if (eocd + 22 > buffer.length) throw new Error("EOCD ZIP tidak lengkap.");
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  const comment = commentLength ? buffer.subarray(eocd + 22, Math.min(buffer.length, eocd + 22 + commentLength)).toString("utf8") : undefined;

  if (totalEntries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error("ZIP64 terdeteksi; listing ZIP64 belum didukung oleh parser bawaan. Gunakan 7z/unzip.");
  }
  if (cdOffset + cdSize > buffer.length) throw new Error("Central directory ZIP berada di luar batas file.");

  const entries: ArchiveEntry[] = [];
  const previews: Array<{ name: string; text: string }> = [];
  const flags = new Map<string, FlagCandidate>();
  let offset = cdOffset;
  let previewBudget = 512 * 1024;
  let truncated = false;

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      truncated = true;
      break;
    }
    const flagsValue = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const entryCommentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength > buffer.length) {
      truncated = true;
      break;
    }
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const name = (flagsValue & 0x800 ? rawName.toString("utf8") : rawName.toString("latin1")).slice(0, 300);
    const encrypted = (flagsValue & 0x1) !== 0;
    const entry: ArchiveEntry = {
      name,
      compressedSize,
      uncompressedSize,
      compression: METHOD_NAMES[method] || `Method ${method}`,
      encrypted,
      crc32: crc.toString(16).padStart(8, "0"),
    };

    if (!encrypted && uncompressedSize <= 256 * 1024 && previewBudget > 0 && compressedSize > 0 && localOffset + 30 <= buffer.length) {
      try {
        if (buffer.readUInt32LE(localOffset) === 0x04034b50) {
          const localNameLength = buffer.readUInt16LE(localOffset + 26);
          const localExtraLength = buffer.readUInt16LE(localOffset + 28);
          const dataStart = localOffset + 30 + localNameLength + localExtraLength;
          const dataEnd = dataStart + compressedSize;
          if (dataEnd <= buffer.length) {
            const compressed = buffer.subarray(dataStart, dataEnd);
            const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1_000_000 }) : null;
            if (content) {
              previewBudget -= content.length;
              if (isPrintableText(content, 0.85)) {
                const text = content.toString("utf8").slice(0, 4000);
                entry.preview = safePreview(text, 600);
                previews.push({ name, text });
                for (const candidate of extractFlagCandidates(text, `ZIP entry ${name}`)) {
                  if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
                }
              }
            }
          }
        }
      } catch {
        entry.preview = "[decompression failed]";
      }
    }
    for (const candidate of extractFlagCandidates(name, `ZIP entry name`)) {
      if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
    }
    entries.push(entry);
    offset += 46 + nameLength + extraLength + entryCommentLength;
    if (entries.length >= 800) {
      truncated = true;
      break;
    }
  }

  const endOfArchive = eocd + 22 + commentLength;
  const trailing = endOfArchive < buffer.length
    ? {
        offset: endOfArchive,
        length: buffer.length - endOfArchive,
        preview: safePreview(buffer.subarray(endOfArchive, endOfArchive + 240).toString("latin1"), 240),
      }
    : undefined;

  return {
    listing: { format: "ZIP", entries, comment, truncated },
    previews,
    flags: [...flags.values()],
    trailing,
  };
}

export function parseTar(buffer: Buffer): ArchiveResult {
  if (buffer.length < 512 || buffer.subarray(257, 262).toString("latin1") !== "ustar") {
    throw new Error("Bukan arsip TAR ustar yang valid.");
  }
  const entries: ArchiveEntry[] = [];
  const previews: Array<{ name: string; text: string }> = [];
  const flags = new Map<string, FlagCandidate>();
  let offset = 0;
  let previewBudget = 256 * 1024;
  let truncated = false;

  while (offset + 512 <= buffer.length) {
    if (entries.length >= 800) {
      truncated = true;
      break;
    }
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const rawName = header.subarray(0, 100).toString("latin1").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("latin1").replace(/\0.*$/, "");
    const name = prefix ? `${prefix}/${rawName}` : rawName;
    const sizeField = header.subarray(124, 136).toString("latin1").replace(/\0.*$/, "").trim();
    const size = sizeField ? parseInt(sizeField, 8) || 0 : 0;
    const type = header[156] ? String.fromCharCode(header[156]) : "0";
    const mtime = header.subarray(136, 148).toString("latin1").replace(/\0.*$/, "").trim();
    const entry: ArchiveEntry = {
      name,
      compressedSize: size,
      uncompressedSize: size,
      compression: type === "5" ? "Directory" : "Store",
      encrypted: false,
      crc32: mtime ? `mtime:${mtime}` : "—",
    };
    const dataStart = offset + 512;
    if (type === "0" && size > 0 && size <= 256 * 1024 && previewBudget > 0 && dataStart + size <= buffer.length) {
      const content = buffer.subarray(dataStart, dataStart + size);
      if (isPrintableText(content, 0.85)) {
        const text = content.toString("utf8").slice(0, 4000);
        entry.preview = safePreview(text, 600);
        previews.push({ name, text });
        previewBudget -= content.length;
        for (const candidate of extractFlagCandidates(text, `TAR entry ${name}`)) {
          if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
        }
      }
    }
    for (const candidate of extractFlagCandidates(name, "TAR entry name")) {
      if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
    }
    entries.push(entry);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return {
    listing: { format: "TAR", entries, truncated },
    previews,
    flags: [...flags.values()],
  };
}

export function parseGzip(buffer: Buffer) {
  if (buffer.length < 18 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) throw new Error("Bukan file GZIP.");
  const method = buffer[2];
  const flags = buffer[3];
  const mtime = buffer.readUInt32LE(4);
  let offset = 10;
  let originalName: string | undefined;
  let comment: string | undefined;
  if (flags & 0x04) {
    const extraLength = buffer.readUInt16LE(offset);
    offset += 2 + extraLength;
  }
  if (flags & 0x08) {
    const end = buffer.indexOf(0, offset);
    originalName = buffer.subarray(offset, end >= 0 ? end : offset + 100).toString("latin1");
    offset = end >= 0 ? end + 1 : offset;
  }
  if (flags & 0x10) {
    const end = buffer.indexOf(0, offset);
    comment = buffer.subarray(offset, end >= 0 ? end : offset + 200).toString("latin1");
    offset = end >= 0 ? end + 1 : offset;
  }
  let inner: Buffer | null = null;
  let error: string | undefined;
  try {
    inner = gunzipSync(buffer, { maxOutputLength: 32 * 1024 * 1024 });
  } catch (err) {
    error = err instanceof Error ? err.message : "GZIP decompression failed";
  }
  return {
    method,
    mtime: mtime ? new Date(mtime * 1000).toISOString() : undefined,
    originalName,
    comment,
    inner,
    error,
  };
}

export function archiveHints(buffer: Buffer) {
  const hints: string[] = [];
  if (buffer.includes(Buffer.from("PK\u0003\u0004", "latin1"))) hints.push("ZIP local header ditemukan di dalam file.");
  if (buffer.includes(Buffer.from("ustar", "latin1"))) hints.push("TAR ustar header ditemukan.");
  if (buffer.includes(Buffer.from("Rar!\u001a\u0007", "latin1"))) hints.push("RAR signature ditemukan.");
  if (buffer.includes(Buffer.from("7z\u00bc\u00af\u0027\u001c", "latin1"))) hints.push("7z signature ditemukan.");
  return hints;
}
