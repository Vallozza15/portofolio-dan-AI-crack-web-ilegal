import { createHash } from "node:crypto";
import { parseGzip, parseTar, parseZip } from "./archive";
import { parseAudio } from "./audio";
import { analyzeBinary, dangerousImports } from "./binaries";
import { autoDecodeLayers, shannonEntropy } from "./crypto";
import { parseJpeg } from "./exif";
import { extractFlagCandidates, findFlagsInBuffer } from "./flag";
import { extractStrings, formatBytes, hexPreview, safePreview, trailingDataAfter } from "./file-utils";
import { detectFileType, findMagicMatches } from "./magic";
import { parsePcap } from "./pcap";
import { parsePdf } from "./pdf";
import { parsePng } from "./png";
import { decodeQr } from "./qr";
import type { CtfCategory, EmbeddedFile, FileAnalysis, FlagCandidate, ImageInfo, StegoFinding } from "./types";

function hash(buffer: Buffer, algorithm: "md5" | "sha1" | "sha256") {
  return createHash(algorithm).update(buffer).digest("hex");
}

function addFlags(map: Map<string, FlagCandidate>, candidates: FlagCandidate[]) {
  for (const candidate of candidates) {
    const existing = map.get(candidate.value);
    if (!existing || existing.confidence < candidate.confidence) map.set(candidate.value, candidate);
  }
}

function gifInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 13 || buffer.subarray(0, 3).toString("latin1") !== "GIF") return null;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const packed = buffer[10];
  const frames = buffer.toString("latin1").split("\u0021\u00f9").length - 1;
  return {
    format: "GIF",
    width,
    height,
    bitDepth: (packed & 0x07) + 1,
    colorType: packed & 0x80 ? "Indexed palette" : "Indexed",
    frames: Math.max(1, frames),
    paletteEntries: packed & 0x80 ? 2 ** ((packed & 0x07) + 1) : 0,
  };
}

function bmpInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 30 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) return null;
  return {
    format: "BMP",
    width: Math.abs(buffer.readInt32LE(18)),
    height: Math.abs(buffer.readInt32LE(22)),
    bitDepth: buffer.readUInt16LE(28),
    colorType: "BGR",
  };
}

function tiffInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 8) return null;
  const little = buffer.subarray(0, 2).toString("latin1") === "II";
  if (!little && buffer.subarray(0, 2).toString("latin1") !== "MM") return null;
  const read16 = (offset: number) => (little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset));
  const read32 = (offset: number) => (little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset));
  if (read16(2) !== 42) return null;
  const ifd = read32(4);
  if (ifd + 2 > buffer.length) return null;
  const count = read16(ifd);
  let width: number | undefined;
  let height: number | undefined;
  for (let index = 0; index < Math.min(count, 100); index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > buffer.length) break;
    const tag = read16(entry);
    if (tag === 0x0100) width = read16(entry + 8);
    if (tag === 0x0101) height = read16(entry + 8);
  }
  return { format: "TIFF", width, height };
}

export interface AnalyzeFileOptions {
  fileId: string;
  customFormat?: string;
  includeQr?: boolean;
}

export function analyzeFileBuffer(buffer: Buffer, name: string, options: AnalyzeFileOptions): FileAnalysis {
  const started = Date.now();
  const detected = detectFileType(buffer, name);
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const extracted = extractStrings(buffer);
  const flags = new Map<string, FlagCandidate>();
  const stego: StegoFinding[] = [];
  const warnings: string[] = [];
  const categoryHints = new Set<CtfCategory>(detected.categories);
  let image: ImageInfo | undefined;
  let audio;
  let executable;
  let pcap;
  let pdf;
  let archive;
  let qr;
  let tags: Record<string, string> | undefined;
  let encodingLayers: Array<{ operation: string; value: string }> | undefined;

  addFlags(flags, findFlagsInBuffer(buffer, "raw file bytes", options.customFormat));
  addFlags(flags, extracted.flagCandidates);

  if (detected.mismatch && ext) {
    warnings.push(`Ekstensi .${ext} tidak cocok dengan signature terdeteksi (${detected.label}). Ini bisa disengaja dalam CTF.`);
  }

  // Images
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    try {
      const png = parsePng(buffer);
      image = png.info;
      stego.push(...png.stego);
      addFlags(flags, png.flags);
      if (png.truncated) warnings.push("Struktur PNG tampak terpotong (chunk melewati akhir file).");
      if (png.trailing) {
        for (const candidate of png.trailing.flagCandidates) addFlags(flags, [candidate]);
        const embedded = findMagicMatches(png.trailing ? buffer.subarray(png.trailing.offset) : Buffer.alloc(0), 10);
        if (embedded.length) stego.push({ technique: "Embedded file setelah IEND", detail: embedded.map((item) => item.signature.label).join(", "), confidence: "high" });
      }
      categoryHints.add("steganography");
      categoryHints.add("forensics");
    } catch (error) {
      warnings.push(`PNG parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    try {
      const jpeg = parseJpeg(buffer);
      image = jpeg.info;
      const exifFlags = new Map<string, FlagCandidate>();
      for (const [key, value] of Object.entries(jpeg.exif)) {
        addFlags(exifFlags, extractFlagCandidates(`${key}: ${value}`, "JPEG EXIF"));
      }
      addFlags(flags, [...exifFlags.values()]);
      for (const comment of jpeg.comments) {
        addFlags(flags, extractFlagCandidates(comment, "JPEG COM comment"));
      }
      if (Object.keys(jpeg.exif).length) {
        stego.push({ technique: "EXIF metadata", detail: `${Object.keys(jpeg.exif).length} tag EXIF ditemukan.`, confidence: "medium", output: safePreview(JSON.stringify(jpeg.exif, null, 2), 1000) });
      }
      if (jpeg.comments.length) {
        stego.push({ technique: "JPEG COM comment", detail: "Komentar JPEG dapat menyembunyikan teks.", confidence: "medium", output: safePreview(jpeg.comments.join("\n"), 800) });
      }
      if (jpeg.trailingBytes) {
        const trailing = trailingDataAfter(buffer, buffer.length - jpeg.trailingBytes, "JPEG EOI");
        if (trailing) {
          stego.push({ technique: "Data setelah EOI", detail: `${trailing.length} byte setelah marker EOI JPEG.`, confidence: "high", output: `${trailing.preview}\n\n${trailing.hex}` });
          addFlags(flags, trailing.flagCandidates);
        }
      }
      categoryHints.add("steganography");
      categoryHints.add("forensics");
    } catch (error) {
      warnings.push(`JPEG parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  } else {
    image = gifInfo(buffer) || bmpInfo(buffer) || tiffInfo(buffer) || undefined;
    if (image) {
      categoryHints.add("steganography");
      if (image.format === "GIF") {
        const trailer = buffer.lastIndexOf(0x3b);
        if (trailer >= 0 && trailer + 1 < buffer.length) {
          const trailing = trailingDataAfter(buffer, trailer + 1, "GIF trailer");
          if (trailing) {
            stego.push({ technique: "Data setelah GIF trailer", detail: `${trailing.length} byte tambahan.`, confidence: "high", output: trailing.preview });
            addFlags(flags, trailing.flagCandidates);
          }
        }
      }
      if (image.format === "BMP" && buffer.length >= 6) {
        const declared = buffer.readUInt32LE(2);
        if (declared > 0 && declared < buffer.length) {
          const trailing = trailingDataAfter(buffer, declared, "BMP declared size");
          if (trailing) {
            stego.push({ technique: "Data setelah BMP", detail: `${trailing.length} byte tambahan.`, confidence: "high", output: trailing.preview });
            addFlags(flags, trailing.flagCandidates);
          }
        }
      }
    }
  }

  // QR decode for images
  if (options.includeQr !== false && image && buffer.length < 15 * 1024 * 1024) {
    try {
      const result = decodeQr(buffer);
      qr = { found: result.found, data: result.data, note: result.note };
      if (result.found && result.data) {
        stego.push({ technique: "QR code", detail: `QR versi ${result.version || "?"} berhasil didekode.`, confidence: "high", output: safePreview(result.data, 1200) });
        addFlags(flags, extractFlagCandidates(result.data, "QR code"));
        addFlags(flags, extractFlagCandidates(result.data, "QR code (custom)", options.customFormat));
      }
    } catch (error) {
      qr = { found: false, note: error instanceof Error ? error.message : "QR decode gagal." };
    }
  }

  // Audio
  const audioResult = parseAudio(buffer, ext);
  if (audioResult) {
    audio = audioResult.info;
    stego.push(...audioResult.stego);
    addFlags(flags, audioResult.flags);
    tags = { ...audioResult.tags };
    if (audioResult.trailing) {
      warnings.push(`Ada ${audioResult.trailing.length} byte setelah akhir container audio.`);
    }
    categoryHints.add("steganography");
    categoryHints.add("forensics");
  }

  // Executables
  try {
    executable = analyzeBinary(buffer);
    categoryHints.add("reverse");
    categoryHints.add("binary");
    const dangerous = dangerousImports(executable);
    if (dangerous.length) {
      warnings.push(`Import/simbol sensitif: ${dangerous.slice(0, 12).join(", ")}`);
    }
    for (const hint of executable.packingHints) warnings.push(hint);
    for (const symbol of executable.symbols) {
      if (/flag|secret|win|shell/i.test(symbol)) {
        addFlags(flags, extractFlagCandidates(symbol, `binary symbol ${symbol}`));
      }
    }
  } catch {
    // Not an executable; expected for most files.
  }

  // PCAP
  if (detected.label.includes("PCAP") || ["pcap", "pcapng", "cap"].includes(ext)) {
    try {
      const result = parsePcap(buffer);
      pcap = result.summary;
      addFlags(flags, result.flags);
      warnings.push(...result.warnings);
      for (const value of result.summary.credentials) addFlags(flags, extractFlagCandidates(value, "PCAP credential"));
      categoryHints.add("forensics");
    } catch (error) {
      warnings.push(`PCAP parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  }

  // PDF
  if (detected.label === "PDF document") {
    try {
      const result = parsePdf(buffer);
      pdf = result.info;
      addFlags(flags, result.flags);
      if (result.trailing) {
        stego.push({ technique: "Data setelah %%EOF", detail: `${result.trailing.length} byte setelah EOF PDF.`, confidence: "high", output: result.trailing.preview });
      }
      if (result.info.hasJavaScript) warnings.push("PDF mengandung JavaScript — perlakukan sebagai tidak tepercaya.");
      if (result.info.hasEmbeddedFiles) warnings.push("PDF mengandung embedded file.");
      categoryHints.add("forensics");
    } catch (error) {
      warnings.push(`PDF parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  }

  // Archives
  if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    try {
      const result = parseZip(buffer);
      archive = result.listing;
      addFlags(flags, result.flags);
      for (const entry of result.listing.entries) {
        if (entry.encrypted) warnings.push(`Entry ZIP terenkripsi: ${entry.name}`);
      }
      if (result.listing.truncated) warnings.push("Listing ZIP dipotong pada 800 entry.");
      if (result.trailing) {
        stego.push({ technique: "Data setelah EOCD ZIP", detail: `${result.trailing.length} byte setelah akhir arsip. Bisa jadi arsip kedua atau data tersembunyi.`, confidence: "high", output: result.trailing.preview });
      }
      categoryHints.add("forensics");
      categoryHints.add("misc");
    } catch (error) {
      warnings.push(`ZIP parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  } else if (buffer.length > 512 && buffer.subarray(257, 262).toString("latin1") === "ustar") {
    try {
      const result = parseTar(buffer);
      archive = result.listing;
      addFlags(flags, result.flags);
      categoryHints.add("forensics");
      categoryHints.add("misc");
    } catch (error) {
      warnings.push(`TAR parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  } else if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      const gzip = parseGzip(buffer);
      tags = { ...(tags || {}), gzip: `Original name: ${gzip.originalName || "unknown"}, mtime: ${gzip.mtime || "unknown"}` };
      if (gzip.error) warnings.push(`GZIP: ${gzip.error}`);
      if (gzip.inner) {
        const inner = detectFileType(gzip.inner, gzip.originalName || "inner");
        warnings.push(`GZIP berisi ${formatBytes(gzip.inner.length)} data (${inner.label}). Dekompresi untuk inspeksi lebih lanjut.`);
        addFlags(flags, findFlagsInBuffer(gzip.inner, "GZIP inner data", options.customFormat));
        const innerStrings = extractStrings(gzip.inner);
        addFlags(flags, innerStrings.flagCandidates);
        if (inner.extension === "tar") {
          try {
            const tar = parseTar(gzip.inner);
            archive = tar.listing;
            addFlags(flags, tar.flags);
          } catch { /* ignore */ }
        }
      }
      categoryHints.add("forensics");
    } catch (error) {
      warnings.push(`GZIP parser: ${error instanceof Error ? error.message : "gagal"}`);
    }
  }

  // Text/encoding layers
  if (detected.label.includes("text") || detected.label.includes("Base64") || ["txt", "log", "b64", "py", "js", "c", "cpp", "java", "json", "xml", "html", "md"].includes(ext)) {
    const text = buffer.toString("utf8");
    if (text.length <= 2_000_000) {
      const layers = autoDecodeLayers(text, 5);
      if (layers.length) {
        encodingLayers = layers.slice(0, 12).map((layer) => ({ operation: layer.path.join(" → "), value: layer.value.slice(0, 6000) }));
        for (const layer of layers) {
          addFlags(flags, extractFlagCandidates(layer.value, `decoded layer ${layer.path.join(" → ")}`, options.customFormat));
        }
        stego.push({
          technique: "Multi-layer encoding",
          detail: `${layers.length} lapisan decoding otomatis ditemukan.`,
          confidence: layers.some((layer) => extractFlagCandidates(layer.value).length) ? "high" : "medium",
          output: safePreview(layers.slice(0, 4).map((layer) => `[${layer.path.join(" → ")}]\n${layer.value}`).join("\n\n"), 1600),
        });
      }
      categoryHints.add("cryptography");
      categoryHints.add("misc");
    }
  }

  // Embedded files
  const embeddedMap = new Map<string, EmbeddedFile>();
  for (const match of findMagicMatches(buffer, 80)) {
    if (match.offset === 0) continue;
    const key = `${match.offset}:${match.signature.label}`;
    if (embeddedMap.has(key)) continue;
    embeddedMap.set(key, {
      offset: match.offset,
      signature: match.signature.hex,
      label: match.signature.label,
      probableExtension: match.signature.extension,
    });
  }
  const embedded = [...embeddedMap.values()].slice(0, 40);
  if (embedded.length) {
    warnings.push(`${embedded.length} signature file lain ditemukan di dalam file ini. Periksa offset dan lakukan carving.`);
    categoryHints.add("forensics");
  }

  if (shannonEntropy(buffer) > 7.5 && buffer.length > 4096) {
    warnings.push("Entropy sangat tinggi (> 7.5 bit/byte). File mungkin terkompresi, terenkripsi, atau packed.");
  }
  if (detected.label === "Unknown binary") {
    warnings.push("Signature tidak dikenal. Gunakan hex preview, strings, dan analisis manual.");
  }

  const flagList = [...flags.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 60);
  return {
    fileId: options.fileId,
    name,
    size: buffer.length,
    mime: detected.mime,
    magic: detected.label,
    sha256: hash(buffer, "sha256"),
    md5: hash(buffer, "md5"),
    sha1: hash(buffer, "sha1"),
    entropy: Number(shannonEntropy(buffer).toFixed(4)),
    categoryHints: [...categoryHints],
    strings: extracted.strings.slice(0, 500),
    stringCount: extracted.total,
    hexPreview: hexPreview(buffer, 1536),
    embedded,
    archive,
    image,
    audio,
    executable,
    pcap,
    pdf,
    stego,
    flagCandidates: flagList,
    warnings: [...new Set(warnings)],
    qr,
    tags,
    encodingLayers,
    analyzedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}
