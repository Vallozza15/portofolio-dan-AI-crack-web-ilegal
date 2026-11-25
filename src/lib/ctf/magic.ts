import type { CtfCategory } from "./types";

export interface MagicSignature {
  label: string;
  extension: string;
  mime: string;
  hex: string;
  offset?: number;
  categories: CtfCategory[];
  description: string;
}

export const MAGIC_SIGNATURES: MagicSignature[] = [
  { label: "PNG image", extension: "png", mime: "image/png", hex: "89504e470d0a1a0a", categories: ["steganography", "forensics"], description: "PNG signature + IHDR" },
  { label: "JPEG image", extension: "jpg", mime: "image/jpeg", hex: "ffd8ff", categories: ["steganography", "forensics"], description: "JPEG SOI marker" },
  { label: "GIF image", extension: "gif", mime: "image/gif", hex: "474946383761", categories: ["steganography", "forensics"], description: "GIF87a" },
  { label: "GIF image", extension: "gif", mime: "image/gif", hex: "474946383961", categories: ["steganography", "forensics"], description: "GIF89a" },
  { label: "BMP image", extension: "bmp", mime: "image/bmp", hex: "424d", categories: ["steganography", "forensics"], description: "Windows bitmap" },
  { label: "TIFF image", extension: "tiff", mime: "image/tiff", hex: "49492a00", categories: ["steganography", "forensics"], description: "Little-endian TIFF" },
  { label: "TIFF image", extension: "tiff", mime: "image/tiff", hex: "4d4d002a", categories: ["steganography", "forensics"], description: "Big-endian TIFF" },
  { label: "WAV audio", extension: "wav", mime: "audio/wav", hex: "52494646", offset: 0, categories: ["steganography", "forensics"], description: "RIFF container (verify WAVE at offset 8)" },
  { label: "MP3 audio", extension: "mp3", mime: "audio/mpeg", hex: "494433", categories: ["steganography", "forensics"], description: "ID3 tag" },
  { label: "FLAC audio", extension: "flac", mime: "audio/flac", hex: "664c6143", categories: ["steganography", "forensics"], description: "fLaC stream" },
  { label: "OGG audio", extension: "ogg", mime: "audio/ogg", hex: "4f676753", categories: ["steganography", "forensics"], description: "OggS container" },
  { label: "MP4 video", extension: "mp4", mime: "video/mp4", hex: "66747970", offset: 4, categories: ["forensics"], description: "ISO BMFF ftyp box" },
  { label: "PDF document", extension: "pdf", mime: "application/pdf", hex: "25504446", categories: ["forensics", "misc"], description: "%PDF header" },
  { label: "ZIP archive", extension: "zip", mime: "application/zip", hex: "504b0304", categories: ["forensics", "misc"], description: "Local file header" },
  { label: "ZIP archive (empty)", extension: "zip", mime: "application/zip", hex: "504b0506", categories: ["forensics", "misc"], description: "End of central directory" },
  { label: "ZIP archive (spanned)", extension: "zip", mime: "application/zip", hex: "504b0708", categories: ["forensics", "misc"], description: "Data descriptor" },
  { label: "RAR archive", extension: "rar", mime: "application/vnd.rar", hex: "526172211a0700", categories: ["forensics", "misc"], description: "RAR 4.x" },
  { label: "RAR5 archive", extension: "rar", mime: "application/vnd.rar", hex: "526172211a070100", categories: ["forensics", "misc"], description: "RAR 5.x" },
  { label: "7-Zip archive", extension: "7z", mime: "application/x-7z-compressed", hex: "377abcaf271c", categories: ["forensics", "misc"], description: "7z signature" },
  { label: "GZIP archive", extension: "gz", mime: "application/gzip", hex: "1f8b", categories: ["forensics", "misc"], description: "Gzip magic" },
  { label: "TAR archive", extension: "tar", mime: "application/x-tar", hex: "7573746172", offset: 257, categories: ["forensics", "misc"], description: "POSIX ustar magic at offset 257" },
  { label: "ELF executable", extension: "elf", mime: "application/x-elf", hex: "7f454c46", categories: ["reverse", "binary"], description: "ELF magic" },
  { label: "PE executable", extension: "exe", mime: "application/vnd.microsoft.portable-executable", hex: "4d5a", categories: ["reverse", "binary"], description: "DOS MZ header (verify PE signature)" },
  { label: "Mach-O executable", extension: "macho", mime: "application/x-mach-binary", hex: "feedface", categories: ["reverse", "binary"], description: "Mach-O 32-bit" },
  { label: "Mach-O executable", extension: "macho", mime: "application/x-mach-binary", hex: "feedfacf", categories: ["reverse", "binary"], description: "Mach-O 64-bit" },
  { label: "SQLite database", extension: "sqlite", mime: "application/vnd.sqlite3", hex: "53514c69746520666f726d6174203300", categories: ["forensics"], description: "SQLite 3 format" },
  { label: "PCAP capture", extension: "pcap", mime: "application/vnd.tcpdump.pcap", hex: "d4c3b2a1", categories: ["forensics"], description: "Classic pcap, little-endian" },
  { label: "PCAP capture", extension: "pcap", mime: "application/vnd.tcpdump.pcap", hex: "a1b2c3d4", categories: ["forensics"], description: "Classic pcap, big-endian" },
  { label: "PCAP capture (ns)", extension: "pcap", mime: "application/vnd.tcpdump.pcap", hex: "4d3cb2a1", categories: ["forensics"], description: "Classic pcap, nanosecond timestamps" },
  { label: "PCAPNG capture", extension: "pcapng", mime: "application/x-pcapng", hex: "0a0d0d0a", categories: ["forensics"], description: "PCAPNG Section Header Block" },
  { label: "Java class", extension: "class", mime: "application/java-vm", hex: "cafebabe", categories: ["reverse"], description: "Java bytecode" },
  { label: "WebAssembly", extension: "wasm", mime: "application/wasm", hex: "0061736d", categories: ["reverse"], description: "WASM module" },
  { label: "OLE compound file", extension: "ole", mime: "application/x-ole-storage", hex: "d0cf11e0a1b11ae1", categories: ["forensics"], description: "DOC/XLS/MSI container" },
  { label: "RTF document", extension: "rtf", mime: "application/rtf", hex: "7b5c727466", categories: ["forensics", "misc"], description: "RTF header" },
  { label: "ICO icon", extension: "ico", mime: "image/x-icon", hex: "00000100", categories: ["forensics"], description: "Windows icon" },
  { label: "PEM certificate/key", extension: "pem", mime: "application/x-pem-file", hex: "2d2d2d2d2d424547494e", categories: ["cryptography", "forensics"], description: "ASCII PEM armor" },
  { label: "PostScript", extension: "ps", mime: "application/postscript", hex: "25215053", categories: ["misc"], description: "%!PS header" },
  { label: "ISO 9660 image", extension: "iso", mime: "application/x-iso9660-image", hex: "4344303031", offset: 32769, categories: ["forensics"], description: "CD001 at sector 16" },
  { label: "DICOM image", extension: "dcm", mime: "application/dicom", hex: "4449434d", offset: 128, categories: ["forensics"], description: "DICM marker" },
];

function hexToBytes(hex: string) {
  return Buffer.from(hex, "hex");
}

export interface MagicMatch {
  signature: MagicSignature;
  offset: number;
  confidence: number;
}

export function findMagicMatches(buffer: Buffer, limit = 80): MagicMatch[] {
  const matches: MagicMatch[] = [];
  for (const signature of MAGIC_SIGNATURES) {
    const bytes = hexToBytes(signature.hex);
    let index = 0;
    while (index <= buffer.length - bytes.length && matches.length < limit) {
      const found = buffer.indexOf(bytes, index);
      if (found < 0) break;
      const expected = signature.offset || 0;
      if (found === expected || found > 0) {
        matches.push({
          signature,
          offset: found,
          confidence: found === expected ? 1 : 0.72,
        });
      }
      index = found + 1;
      if (matches.length >= limit) break;
    }
  }
  return matches.sort((a, b) => a.offset - b.offset || b.confidence - a.confidence);
}

export interface DetectedType {
  label: string;
  extension: string;
  mime: string;
  description: string;
  categories: CtfCategory[];
  confidence: number;
  mismatch: boolean;
}

const TEXT_EXTENSIONS = new Set(["txt", "log", "py", "js", "c", "cpp", "java", "html", "css", "json", "xml", "md", "csv", "sh", "ps1", "yml", "yaml", "conf", "ini"]);

export function detectFileType(buffer: Buffer, filename = ""): DetectedType {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const candidates = findMagicMatches(buffer, 30).filter((match) => match.offset === (match.signature.offset || 0));

  for (const match of candidates) {
    const signature = match.signature;
    if (signature.hex === "52494646" && buffer.length > 12) {
      const form = buffer.subarray(8, 12).toString("ascii");
      if (form === "WAVE") return { ...signature, label: "WAV audio", extension: "wav", mime: "audio/wav", description: "RIFF/WAVE audio", confidence: 1, mismatch: ext !== "wav" };
      if (form === "AVI ") return { ...signature, label: "AVI video", extension: "avi", mime: "video/x-msvideo", description: "RIFF/AVI video", confidence: 1, mismatch: ext !== "avi" };
    }
    if (signature.hex === "4d5a") {
      const peOffset = buffer.length >= 0x40 ? buffer.readUInt32LE(0x3c) : 0;
      const isPe = peOffset > 0 && peOffset + 4 <= buffer.length && buffer.subarray(peOffset, peOffset + 4).toString("latin1") === "PE\u0000\u0000";
      if (!isPe) continue;
      return { ...signature, confidence: 1, mismatch: !["exe", "dll", "sys", "scr"].includes(ext) };
    }
    if (signature.hex === "66747970") {
      if (buffer.length < 12) continue;
      const brand = buffer.subarray(8, 12).toString("ascii");
      const label = brand.startsWith("qt") ? "QuickTime video" : brand.startsWith("heic") || brand.startsWith("mif1") ? "HEIC image" : "MP4/ISO media";
      return { ...signature, label, confidence: 1, mismatch: !["mp4", "mov", "m4a", "heic", "avif"].includes(ext) };
    }
    return { ...signature, confidence: match.confidence, mismatch: signature.extension !== ext && ext !== "" };
  }

  const head = buffer.subarray(0, 4096).toString("utf8").trimStart();
  if (head.startsWith("{") || head.startsWith("[")) {
    try {
      JSON.parse(buffer.toString("utf8"));
      return { label: "JSON data", extension: "json", mime: "application/json", description: "Valid JSON text", categories: ["misc", "web"], confidence: 0.95, mismatch: ext !== "json" };
    } catch { /* not valid JSON */ }
  }
  if (/^<(!doctype html|html|head|body)/i.test(head)) {
    return { label: "HTML document", extension: "html", mime: "text/html", description: "HTML markup", categories: ["web", "misc"], confidence: 0.95, mismatch: !["html", "htm"].includes(ext) };
  }
  if (/^<\?xml/i.test(head)) {
    return { label: "XML document", extension: "xml", mime: "application/xml", description: "XML markup", categories: ["misc", "web"], confidence: 0.9, mismatch: ext !== "xml" };
  }
  if (/^-----BEGIN [A-Z ]+-----/.test(head)) {
    return { label: "PEM text", extension: "pem", mime: "application/x-pem-file", description: "PEM-armored key/certificate", categories: ["cryptography"], confidence: 0.98, mismatch: ext !== "pem" };
  }
  if (buffer.length && isMostlyText(buffer)) {
    return { label: "Plain text", extension: TEXT_EXTENSIONS.has(ext) ? ext : "txt", mime: "text/plain", description: "UTF-8/ASCII text", categories: ["misc", "cryptography"], confidence: 0.8, mismatch: !TEXT_EXTENSIONS.has(ext) };
  }
  if (/^[A-Za-z0-9+/=\r\n]{40,}$/.test(head)) {
    return { label: "Base64 text", extension: "b64", mime: "text/plain", description: "Likely Base64-encoded data", categories: ["cryptography"], confidence: 0.6, mismatch: ext !== "b64" };
  }
  return { label: "Unknown binary", extension: ext || "bin", mime: "application/octet-stream", description: "No known signature matched", categories: ["forensics", "reverse"], confidence: 0.2, mismatch: false };
}

export function isMostlyText(buffer: Buffer) {
  const sample = buffer.subarray(0, 8192);
  if (!sample.length) return true;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 0x80) printable += 1;
  }
  return printable / sample.length > 0.9;
}

export function mimeForExtension(ext: string) {
  const found = MAGIC_SIGNATURES.find((signature) => signature.extension === ext.toLowerCase());
  return found?.mime || "application/octet-stream";
}
