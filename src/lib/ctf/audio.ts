import { extractFlagCandidates } from "./flag";
import { isPrintableText, safePreview } from "./file-utils";
import type { AudioInfo, FlagCandidate, StegoFinding } from "./types";

export interface AudioResult {
  info: AudioInfo;
  stego: StegoFinding[];
  flags: FlagCandidate[];
  trailing?: { offset: number; length: number; preview: string };
  tags: Record<string, string>;
}

export function parseWav(buffer: Buffer): AudioResult {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("latin1") !== "RIFF" || buffer.subarray(8, 12).toString("latin1") !== "WAVE") {
    throw new Error("Bukan file WAV RIFF/WAVE yang valid.");
  }
  const declaredSize = buffer.readUInt32LE(4);
  const info: AudioInfo = { format: "WAV", chunks: [] };
  const tags: Record<string, string> = {};
  const stego: StegoFinding[] = [];
  const flags = new Map<string, FlagCandidate>();
  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number; blockAlign: number; byteRate: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("latin1");
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    info.chunks?.push({ id, size });
    if (id === "fmt " && start + 16 <= buffer.length) {
      const audioFormat = buffer.readUInt16LE(start);
      fmt = {
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
      tags["Audio format"] = audioFormat === 1 ? "PCM" : audioFormat === 3 ? "IEEE float" : `Format ${audioFormat}`;
      info.sampleRate = fmt.sampleRate;
      info.channels = fmt.channels;
      info.bitsPerSample = fmt.bitsPerSample;
      info.durationSeconds = fmt.byteRate ? Number((dataSize / fmt.byteRate).toFixed(3)) : undefined;
    } else if (id === "data") {
      dataOffset = start;
      dataSize = Math.min(size, buffer.length - start);
      if (fmt?.byteRate) info.durationSeconds = Number((dataSize / fmt.byteRate).toFixed(3));
    } else if (id === "LIST") {
      const list = buffer.subarray(start, Math.min(end, buffer.length)).toString("latin1");
      tags["LIST"] = safePreview(list.replace(/\0/g, " "), 500);
      for (const candidate of extractFlagCandidates(list, "WAV LIST chunk")) {
        if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
      }
    } else if (id === "bext" || id === "iXML" || id === "cue " || id === "smpl") {
      const text = buffer.subarray(start, Math.min(end, buffer.length)).toString("latin1");
      tags[id.trim()] = safePreview(text.replace(/\0/g, " "), 500);
    }
    if (end <= offset) break;
    offset = end + (size % 2);
  }

  const endOfRiff = Math.min(buffer.length, declaredSize + 8);
  const trailing = endOfRiff < buffer.length
    ? { offset: endOfRiff, length: buffer.length - endOfRiff, preview: safePreview(buffer.subarray(endOfRiff, endOfRiff + 240).toString("latin1"), 240) }
    : undefined;
  info.trailingBytes = trailing?.length;

  if (trailing) {
    stego.push({
      technique: "Data setelah RIFF",
      detail: `${trailing.length} byte berada setelah ukuran RIFF yang dideklarasikan.`,
      confidence: "high",
      output: trailing.preview,
    });
    for (const candidate of extractFlagCandidates(trailing.preview, "WAV trailing bytes")) {
      if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
    }
  }

  if (dataOffset >= 0 && fmt && (fmt.bitsPerSample === 8 || fmt.bitsPerSample === 16)) {
    const lsb = extractWavLsb(buffer.subarray(dataOffset, dataOffset + dataSize), fmt.bitsPerSample, fmt.channels);
    stego.push(...lsb);
    for (const finding of lsb) {
      if (!finding.output) continue;
      for (const candidate of extractFlagCandidates(finding.output, `WAV LSB (${finding.technique})`)) {
        if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
      }
    }
  } else {
    stego.push({
      technique: "LSB audio",
      detail: "Ekstraksi LSB otomatis mendukung PCM 8/16-bit. Format ini memerlukan Sonic Visualiser atau ffmpeg.",
      confidence: "low",
    });
  }

  return { info, stego, flags: [...flags.values()], trailing, tags };
}

function bitsToText(bits: number[]) {
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | bits[i * 8 + bit];
    bytes[i] = value;
  }
  return bytes;
}

function extractWavLsb(data: Buffer, bitsPerSample: number, channels: number) {
  const findings: StegoFinding[] = [];
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(data.length / bytesPerSample);
  const maxSamples = Math.min(totalSamples, 2_000_000);
  const planes: Array<{ label: string; values: number[] }> = [];

  for (let plane = 0; plane < Math.min(3, bitsPerSample); plane += 1) {
    const values: number[] = [];
    for (let sample = 0; sample < maxSamples; sample += 1) {
      const offset = sample * bytesPerSample;
      if (bitsPerSample === 16) {
        values.push((data.readUInt16LE(offset) >> plane) & 1);
      } else {
        values.push((data[offset] >> plane) & 1);
      }
    }
    planes.push({ label: `bit ${plane}`, values });
  }

  const seen = new Set<string>();
  for (const plane of planes) {
    for (const invert of [false, true]) {
      const bits = invert ? plane.values.map((value) => value ^ 1) : plane.values;
      const bytes = bitsToText(bits);
      const text = bytes.toString("latin1");
      const flags = extractFlagCandidates(text, `WAV LSB ${plane.label}`);
      const printable = isPrintableText(bytes, 0.82);
      const signature = bytes.subarray(0, 8).toString("hex");
      if (!flags.length && !printable) continue;
      const preview = safePreview(text.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "·"), 600);
      if (!preview.trim() || seen.has(preview)) continue;
      seen.add(preview);
      findings.push({
        technique: `${plane.label}${invert ? " (inverted)" : ""}`,
        detail: flags.length
          ? `Kandidat flag ditemukan: ${flags.map((flag) => flag.value).join(", ")}`
          : `Teks printable ditemukan pada LSB audio (${signature || "no signature"}).`,
        confidence: flags.length ? "high" : "medium",
        output: preview,
      });
      if (findings.length >= 8) break;
    }
    if (findings.length >= 8) break;
  }

  if (!findings.length) {
    findings.push({
      technique: "LSB audio",
      detail: `Tidak ada teks pada bit-plane 0–2 dari ${maxSamples} sampel (${channels} channel). Coba analisis spektrogram.`,
      confidence: "low",
    });
  }
  return findings;
}

export function parseMp3(buffer: Buffer): AudioResult {
  const info: AudioInfo = { format: "MP3", chunks: [] };
  const tags: Record<string, string> = {};
  const flags = new Map<string, FlagCandidate>();
  const stego: StegoFinding[] = [];
  if (buffer.subarray(0, 3).toString("latin1") === "ID3" && buffer.length >= 10) {
    const version = `ID3v2.${buffer[3]}.${buffer[4]}`;
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
    tags.Version = version;
    tags["Tag size"] = `${size} byte`;
    let offset = 10;
    const end = Math.min(buffer.length, 10 + size);
    while (offset + 10 <= end) {
      const frameId = buffer.subarray(offset, offset + 4).toString("latin1");
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      const frameSize = buffer.readUInt32BE(offset + 4);
      const frameStart = offset + 10;
      if (frameSize <= 0 || frameStart + frameSize > end) break;
      const raw = buffer.subarray(frameStart, frameStart + frameSize);
      if (["TIT2", "TPE1", "TALB", "TCON", "TRCK", "COMM", "TXXX"].includes(frameId)) {
        const text = raw.subarray(1).toString("utf8").replace(/\0/g, " ").trim();
        tags[frameId] = safePreview(text, 500);
        for (const candidate of extractFlagCandidates(text, `MP3 ${frameId}`)) {
          if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
        }
      }
      offset = frameStart + frameSize;
    }
    stego.push({
      technique: "ID3 metadata",
      detail: `Tag ${version} berisi ${Object.keys(tags).length} field yang dapat diperiksa.`,
      confidence: "medium",
      output: safePreview(JSON.stringify(tags, null, 2), 800),
    });
  }
  const trailing = extractFlagCandidates(buffer.toString("latin1"), "MP3 raw strings");
  for (const candidate of trailing) if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
  return { info, stego, flags: [...flags.values()], tags };
}

export function parseFlac(buffer: Buffer): AudioResult {
  const info: AudioInfo = { format: "FLAC" };
  const tags: Record<string, string> = {};
  const flags = new Map<string, FlagCandidate>();
  let offset = 4;
  let last = false;
  while (!last && offset + 4 <= buffer.length) {
    const header = buffer[offset];
    last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
    const start = offset + 4;
    if (type === 0 && length >= 34 && start + 18 <= buffer.length) {
      const sampleRate = (buffer[start + 10] << 12) | (buffer[start + 11] << 4) | (buffer[start + 12] >> 4);
      const channels = ((buffer[start + 12] >> 1) & 0x7) + 1;
      const bits = (((buffer[start + 12] & 1) << 4) | (buffer[start + 13] >> 4)) + 1;
      info.sampleRate = sampleRate;
      info.channels = channels;
      info.bitsPerSample = bits;
      tags["Stream info"] = `${sampleRate} Hz, ${channels} ch, ${bits} bit`;
    } else if (type === 4 && start + 4 <= buffer.length) {
      const vendorLength = buffer.readUInt32LE(start);
      let cursor = start + 4 + vendorLength;
      if (cursor + 4 <= buffer.length) {
        const count = buffer.readUInt32LE(cursor);
        cursor += 4;
        for (let i = 0; i < count && cursor + 4 <= buffer.length && i < 100; i += 1) {
          const len = buffer.readUInt32LE(cursor);
          cursor += 4;
          const text = buffer.subarray(cursor, Math.min(buffer.length, cursor + len)).toString("utf8");
          cursor += len;
          const [key, ...rest] = text.split("=");
          tags[key] = rest.join("=").slice(0, 500);
          for (const candidate of extractFlagCandidates(text, "FLAC Vorbis comment")) {
            if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
          }
        }
      }
    }
    offset = start + length;
  }
  return {
    info,
    stego: [{ technique: "FLAC metadata", detail: "Metadata block dan Vorbis comment diperiksa.", confidence: "low", output: safePreview(JSON.stringify(tags, null, 2), 800) }],
    flags: [...flags.values()],
    tags,
  };
}

export function parseAudio(buffer: Buffer, extension: string): AudioResult | null {
  const ext = extension.toLowerCase();
  if (ext === "wav" || (buffer.length > 12 && buffer.subarray(8, 12).toString("latin1") === "WAVE")) return parseWav(buffer);
  if (ext === "mp3" || buffer.subarray(0, 3).toString("latin1") === "ID3") return parseMp3(buffer);
  if (ext === "flac" || buffer.subarray(0, 4).toString("latin1") === "fLaC") return parseFlac(buffer);
  return null;
}
