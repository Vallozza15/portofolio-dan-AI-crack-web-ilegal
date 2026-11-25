import { safePreview } from "./file-utils";
import type { ImageInfo } from "./types";

const TAG_NAMES: Record<number, string> = {
  0x0100: "ImageWidth",
  0x0101: "ImageLength",
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x013e: "WhitePoint",
  0x013f: "PrimaryChromaticities",
  0x0213: "YCbCrPositioning",
  0x8298: "Copyright",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8769: "ExifIFDPointer",
  0x8822: "ExposureProgram",
  0x8827: "ISOSpeedRatings",
  0x8830: "SensitivityType",
  0x9000: "ExifVersion",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9010: "OffsetTime",
  0x9011: "OffsetTimeOriginal",
  0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue",
  0x9203: "BrightnessValue",
  0x9204: "ExposureBiasValue",
  0x9205: "MaxApertureValue",
  0x9207: "MeteringMode",
  0x9208: "LightSource",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0x927c: "MakerNote",
  0x9286: "UserComment",
  0x9290: "SubSecTime",
  0x9291: "SubSecTimeOriginal",
  0x9292: "SubSecTimeDigitized",
  0xa000: "FlashpixVersion",
  0xa001: "ColorSpace",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa004: "RelatedSoundFile",
  0xa005: "InteroperabilityIFDPointer",
  0xa20e: "FocalPlaneXResolution",
  0xa20f: "FocalPlaneYResolution",
  0xa210: "FocalPlaneResolutionUnit",
  0xa217: "SensingMethod",
  0xa300: "FileSource",
  0xa301: "SceneType",
  0xa401: "CustomRendered",
  0xa402: "ExposureMode",
  0xa403: "WhiteBalance",
  0xa404: "DigitalZoomRatio",
  0xa405: "FocalLengthIn35mmFilm",
  0xa406: "SceneCaptureType",
  0xa407: "GainControl",
  0xa408: "Contrast",
  0xa409: "Saturation",
  0xa40a: "Sharpness",
  0xa40c: "SubjectDistanceRange",
  0xa420: "ImageUniqueID",
  0xa430: "CameraOwnerName",
  0xa431: "BodySerialNumber",
  0xa432: "LensSpecification",
  0xa433: "LensMake",
  0xa434: "LensModel",
  0xa435: "LensSerialNumber",
  0x8825: "GPSInfoIFDPointer",
};

const GPS_TAGS: Record<number, string> = {
  0x0000: "GPSVersionID",
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude",
  0x0007: "GPSTimeStamp",
  0x0008: "GPSSatellites",
  0x0009: "GPSStatus",
  0x000a: "GPSMeasureMode",
  0x000b: "GPSDOP",
  0x000c: "GPSSpeedRef",
  0x000d: "GPSSpeed",
  0x000e: "GPSTrackRef",
  0x000f: "GPSTrack",
  0x0010: "GPSImgDirectionRef",
  0x0011: "GPSImgDirection",
  0x0012: "GPSMapDatum",
  0x001d: "GPSDateStamp",
};

const TYPE_SIZE: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4,
};

export interface ExifResult {
  exif: Record<string, string>;
  comments: string[];
  tiffOffset: number;
}

function readValue(buffer: Buffer, tiffStart: number, type: number, count: number, valueOffset: number, little: boolean) {
  const size = TYPE_SIZE[type] || 1;
  const total = size * count;
  const pointer = little ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset);
  const start = total <= 4 ? valueOffset : tiffStart + pointer;
  if (start < 0 || start + total > buffer.length) return null;
  const data = buffer.subarray(start, start + total);

  if (type === 2) {
    return data.toString("utf8").replace(/\0+$/, "").trim();
  }
  if (type === 7) {
    return `[${total} byte] ${safePreview(data.toString("hex"), 80)}`;
  }
  if (type === 5 || type === 10) {
    const values: string[] = [];
    for (let i = 0; i + 8 <= data.length; i += 8) {
      const numerator = little ? data.readUInt32LE(i) : data.readUInt32BE(i);
      const denominator = little ? data.readUInt32LE(i + 4) : data.readUInt32BE(i + 4);
      values.push(denominator ? `${numerator}/${denominator} (${(numerator / denominator).toFixed(4)})` : `${numerator}/0`);
    }
    return values.join(", ");
  }
  const values: number[] = [];
  for (let i = 0; i + size <= data.length && values.length < 64; i += size) {
    if (type === 1 || type === 6 || type === 7) values.push(data[i]);
    else if (type === 3) values.push(little ? data.readUInt16LE(i) : data.readUInt16BE(i));
    else if (type === 4) values.push(little ? data.readUInt32LE(i) : data.readUInt32BE(i));
    else if (type === 8) values.push(little ? data.readInt16LE(i) : data.readInt16BE(i));
    else if (type === 9) values.push(little ? data.readInt32LE(i) : data.readInt32BE(i));
  }
  return values.join(", ");
}

export function parseTiffExif(buffer: Buffer, tiffStart = 0): Record<string, string> {
  const exif: Record<string, string> = {};
  if (tiffStart + 8 > buffer.length) return exif;
  const order = buffer.subarray(tiffStart, tiffStart + 2).toString("ascii");
  if (order !== "II" && order !== "MM") return exif;
  const little = order === "II";
  const read16 = (offset: number) => (little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset));
  const read32 = (offset: number) => (little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset));
  if (read16(tiffStart + 2) !== 42) return exif;
  const visited = new Set<number>();
  const queue: Array<{ offset: number; gps: boolean; depth: number }> = [
    { offset: read32(tiffStart + 4), gps: false, depth: 0 },
  ];
  let count = 0;

  while (queue.length && count < 200) {
    const ifd = queue.shift();
    if (!ifd) break;
    const start = tiffStart + ifd.offset;
    if (ifd.offset === 0 || start + 2 > buffer.length || visited.has(ifd.offset) || ifd.depth > 4) continue;
    visited.add(ifd.offset);
    const entries = read16(start);
    if (entries > 400) continue;
    for (let i = 0; i < entries; i += 1) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > buffer.length) break;
      const tag = read16(entry);
      const type = read16(entry + 2);
      const valueCount = read32(entry + 4);
      const valueOffset = entry + 8;
      const name = (ifd.gps ? GPS_TAGS[tag] : TAG_NAMES[tag]) || (ifd.gps ? `GPS_0x${tag.toString(16)}` : `Tag_0x${tag.toString(16)}`);
      if (tag === 0x8769 || tag === 0x8825) {
        const nextOffset = read32(valueOffset);
        if (nextOffset) queue.push({ offset: nextOffset, gps: tag === 0x8825, depth: ifd.depth + 1 });
        continue;
      }
      const value = readValue(buffer, tiffStart, type, valueCount, valueOffset, little);
      if (value !== null && value !== "") {
        exif[name] = String(value).slice(0, 500);
        count += 1;
      }
    }
    const next = start + 2 + entries * 12;
    if (next + 4 <= buffer.length) {
      const nextOffset = read32(next);
      if (nextOffset) queue.push({ offset: nextOffset, gps: ifd.gps, depth: ifd.depth + 1 });
    }
  }
  return exif;
}

export function parseJpeg(buffer: Buffer): { info: ImageInfo; exif: Record<string, string>; comments: string[]; trailingBytes: number } {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Bukan file JPEG yang valid.");
  }
  const info: ImageInfo = { format: "JPEG", chunks: [] };
  const exif: Record<string, string> = {};
  const comments: string[] = [];
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      if (marker === 0xd9) break;
      continue;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    const dataStart = offset + 4;
    const dataEnd = offset + 2 + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (marker === 0xe1 && data.subarray(0, 6).toString("latin1") === "Exif\u0000\u0000") {
      Object.assign(exif, parseTiffExif(data, 6));
    } else if (marker === 0xfe) {
      comments.push(data.toString("latin1").replace(/\0/g, "").slice(0, 1000));
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (data.length >= 5) {
        info.height = data.readUInt16BE(1);
        info.width = data.readUInt16BE(3);
        info.bitDepth = data[0];
        info.channels = data[5] || undefined;
      }
    }
    info.chunks?.push({ type: `0x${marker.toString(16)}`, length: data.length });
    offset = dataEnd;
    if (marker === 0xda) break;
  }

  const eoi = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
  const trailingBytes = eoi >= 0 && eoi + 2 < buffer.length ? buffer.length - (eoi + 2) : 0;
  info.trailingBytes = trailingBytes;
  info.exif = exif;
  return { info, exif, comments, trailingBytes };
}
