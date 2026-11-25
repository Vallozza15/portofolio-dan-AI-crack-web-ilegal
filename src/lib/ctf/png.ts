import { inflateSync } from "node:zlib";
import { extractFlagCandidates } from "./flag";
import { hexPreview, isPrintableText, safePreview, trailingDataAfter } from "./file-utils";
import type { ImageInfo, StegoFinding } from "./types";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const COLOR_TYPES: Record<number, string> = {
  0: "Grayscale",
  2: "Truecolor (RGB)",
  3: "Indexed palette",
  4: "Grayscale + alpha",
  6: "Truecolor + alpha (RGBA)",
};

export interface PngResult {
  info: ImageInfo;
  stego: StegoFinding[];
  trailing: ReturnType<typeof trailingDataAfter>;
  flags: ReturnType<typeof extractFlagCandidates>;
  truncated: boolean;
}

export function parsePng(buffer: Buffer): PngResult {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Bukan file PNG yang valid.");
  }

  const info: ImageInfo = { format: "PNG", chunks: [] };
  const textChunks: string[] = [];
  const idat: Buffer[] = [];
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let endOffset = buffer.length;
  let truncated = false;
  const flags = new Map<string, ReturnType<typeof extractFlagCandidates>[number]>();

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd > buffer.length || crcEnd > buffer.length) {
      truncated = true;
      break;
    }
    const data = buffer.subarray(dataStart, dataEnd);
    const chunk: { type: string; length: number; text?: string } = { type, length };

    if (type === "IHDR" && data.length >= 13) {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      info.width = width;
      info.height = height;
      info.bitDepth = bitDepth;
      info.colorType = COLOR_TYPES[colorType] || `Color type ${colorType}`;
      info.channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 1;
    } else if (type === "PLTE") {
      info.paletteEntries = Math.floor(data.length / 3);
    } else if (type === "tEXt") {
      const separator = data.indexOf(0);
      if (separator > 0) {
        const keyword = data.subarray(0, separator).toString("latin1");
        const text = data.subarray(separator + 1).toString("latin1");
        chunk.text = `${keyword}: ${text}`;
        textChunks.push(chunk.text);
      }
    } else if (type === "zTXt") {
      const separator = data.indexOf(0);
      if (separator > 0 && separator + 2 <= data.length) {
        const keyword = data.subarray(0, separator).toString("latin1");
        try {
          const text = inflateSync(data.subarray(separator + 2), { maxOutputLength: 1_000_000 }).toString("utf8");
          chunk.text = `${keyword}: ${text}`;
          textChunks.push(chunk.text);
        } catch {
          chunk.text = `${keyword}: [zTXt decompression failed]`;
        }
      }
    } else if (type === "iTXt") {
      const separator = data.indexOf(0);
      if (separator > 0 && separator + 3 <= data.length) {
        const keyword = data.subarray(0, separator).toString("latin1");
        const compressionFlag = data[separator + 1];
        let cursor = separator + 3;
        const languageEnd = data.indexOf(0, cursor);
        if (languageEnd > 0) {
          cursor = languageEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0) {
            cursor = translatedEnd + 1;
            try {
              const payload = compressionFlag ? inflateSync(data.subarray(cursor), { maxOutputLength: 1_000_000 }) : data.subarray(cursor);
              const text = payload.toString("utf8");
              chunk.text = `${keyword}: ${text}`;
              textChunks.push(chunk.text);
            } catch {
              chunk.text = `${keyword}: [iTXt decompression failed]`;
            }
          }
        }
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      endOffset = crcEnd;
      info.chunks?.push(chunk);
      break;
    }

    if (chunk.text) {
      for (const candidate of extractFlagCandidates(chunk.text, `PNG ${type} chunk`)) {
        if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
      }
    }
    info.chunks?.push(chunk);
    offset = crcEnd;
  }

  if (!width || !height) throw new Error("IHDR PNG tidak ditemukan atau rusak.");
  if ((info.chunks?.length || 0) > 120) info.chunks = info.chunks?.slice(0, 120);

  const stego: StegoFinding[] = [];
  if (textChunks.length) {
    stego.push({
      technique: "PNG text chunk",
      detail: `Ditemukan ${textChunks.length} chunk teks (tEXt/zTXt/iTXt).`,
      confidence: "high",
      output: safePreview(textChunks.join("\n"), 1200),
    });
  }

  const trailing = trailingDataAfter(buffer, endOffset, "PNG IEND");
  if (trailing) {
    info.trailingBytes = trailing.length;
    stego.push({
      technique: "Data setelah IEND",
      detail: `${trailing.length} byte berada setelah akhir PNG. Ini sering menyembunyikan arsip atau teks.`,
      confidence: "high",
      output: `${trailing.preview}\n\n${trailing.hex}`,
    });
    for (const candidate of trailing.flagCandidates) {
      if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
    }
  }

  if (bitDepth === 8 && interlace === 0 && colorType !== 3) {
    try {
      const pixels = decodePngPixels(Buffer.concat(idat), width, height, colorType);
      const lsb = extractPngLsb(pixels, width, height, colorType);
      stego.push(...lsb);
      for (const finding of lsb) {
        if (!finding.output) continue;
        for (const candidate of extractFlagCandidates(finding.output, `PNG LSB (${finding.technique})`)) {
          if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
        }
      }
    } catch (error) {
      stego.push({
        technique: "LSB extraction",
        detail: `Dekode piksel gagal: ${error instanceof Error ? error.message : "unknown error"}`,
        confidence: "low",
      });
    }
  } else if (colorType === 3) {
    stego.push({
      technique: "LSB extraction",
      detail: "PNG terindeks palet (color type 3) tidak dianalisis LSB langsung; konversi ke RGBA terlebih dahulu.",
      confidence: "low",
    });
  } else if (bitDepth !== 8 || interlace !== 0) {
    stego.push({
      technique: "LSB extraction",
      detail: `LSB otomatis hanya untuk PNG 8-bit non-interlaced (file ini: ${bitDepth}-bit, interlace ${interlace}).`,
      confidence: "low",
    });
  }

  return {
    info,
    stego,
    trailing,
    flags: [...flags.values()],
    truncated,
  };
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngPixels(compressed: Buffer, width: number, height: number, colorType: number) {
  if (width * height > 8_000_000) throw new Error("Gambar terlalu besar untuk analisis LSB (batas 8 juta piksel).");
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 1;
  const stride = width * channels;
  const raw = inflateSync(compressed, { maxOutputLength: 256 * 1024 * 1024 });
  const expected = (stride + 1) * height;
  if (raw.length < expected) throw new Error(`Data IDAT terpotong (${raw.length}/${expected} byte).`);
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const row = Buffer.from(raw.subarray(rowStart, rowStart + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Filter PNG tidak dikenal: ${filter}`);
    }
    row.copy(pixels, y * stride);
    previous = row;
  }
  return pixels;
}

function bitsToBuffer(bits: number[], msbFirst: boolean) {
  const output = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < output.length; i += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const source = msbFirst ? bits[i * 8 + bit] : bits[i * 8 + (7 - bit)];
      value = (value << 1) | source;
    }
    output[i] = value;
  }
  return output;
}

function extractPngLsb(pixels: Buffer, width: number, height: number, colorType: number) {
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 1;
  const labels = colorType === 2 ? ["R", "G", "B"] : colorType === 6 ? ["R", "G", "B", "A"] : colorType === 4 ? ["Gray", "Alpha"] : ["Gray"];
  const findings: StegoFinding[] = [];
  const seen = new Set<string>();
  const maxBits = 2_000_000;

  const inspect = (bits: number[], label: string) => {
    for (const msbFirst of [true, false]) {
      const output = bitsToBuffer(bits, msbFirst);
      const text = output.toString("latin1");
      const flags = extractFlagCandidates(text, `PNG LSB ${label}`);
      const printable = isPrintableText(output, 0.82);
      const signature = output.subarray(0, 8).toString("hex");
      const known = ["89504e470d0a1a0a", "ffd8ff", "504b0304", "25504446", "1f8b"].includes(signature);
      if (!flags.length && !printable && !known) continue;
      const preview = safePreview(text.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "·"), 600);
      if (!preview.trim() || seen.has(preview)) continue;
      seen.add(preview);
      findings.push({
        technique: `${label} (${msbFirst ? "MSB-first" : "LSB-first"})`,
        detail: flags.length
          ? `Kandidat flag ditemukan pada LSB. ${flags.map((flag) => flag.value).join(", ")}`
          : known
            ? `Data LSB memiliki signature file: ${signature}.`
            : `Teks printable ditemukan pada LSB (${text.length} byte).`,
        confidence: flags.length ? "high" : printable ? "medium" : "low",
        output: preview,
      });
    }
  };

  for (let channel = 0; channel < channels && findings.length < 10; channel += 1) {
    for (let plane = 0; plane < 3 && findings.length < 10; plane += 1) {
      const bits: number[] = [];
      for (let index = channel; index < pixels.length && bits.length < maxBits; index += channels) {
        bits.push((pixels[index] >> plane) & 1);
      }
      inspect(bits, `${labels[channel]} bit ${plane}`);
    }
  }

  for (let plane = 0; plane < 3 && findings.length < 10; plane += 1) {
    const bits: number[] = [];
    for (let index = 0; index < pixels.length && bits.length < maxBits; index += 1) {
      bits.push((pixels[index] >> plane) & 1);
    }
    inspect(bits, `interleaved RGB bit ${plane}`);
  }

  if (!findings.length) {
    findings.push({
      technique: "LSB extraction",
      detail: `Tidak ada teks/flag yang jelas pada bit-plane 0–2 dari ${width}×${height} piksel. Coba zsteg/stegsolve untuk varian lain.`,
      confidence: "low",
    });
  }
  return findings;
}

export function pngChunkHex(buffer: Buffer) {
  return hexPreview(buffer, 256);
}
