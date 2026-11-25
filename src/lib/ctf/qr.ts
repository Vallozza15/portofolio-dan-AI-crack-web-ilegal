import jpeg from "jpeg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";

export interface QrResult {
  found: boolean;
  data?: string;
  version?: number;
  location?: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomLeft: { x: number; y: number }; bottomRight: { x: number; y: number } };
  width: number;
  height: number;
  note: string;
}

export function decodeQr(buffer: Buffer, mime = ""): QrResult {
  let width = 0;
  let height = 0;
  let rgba: Uint8ClampedArray;

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || mime.includes("png")) {
    const png = PNG.sync.read(buffer);
    width = png.width;
    height = png.height;
    rgba = new Uint8ClampedArray(png.data);
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    width = decoded.width;
    height = decoded.height;
    rgba = new Uint8ClampedArray(decoded.data);
  } else {
    throw new Error("QR decode mendukung PNG dan JPEG. Konversi gambar lain ke PNG terlebih dahulu.");
  }

  if (width * height > 25_000_000) throw new Error("Gambar terlalu besar untuk QR decode (batas 25 MP).");
  const result = jsQR(rgba, width, height, { inversionAttempts: "attemptBoth" });
  return {
    found: Boolean(result),
    data: result?.data,
    version: result?.version,
    location: result?.location
      ? {
          topLeft: result.location.topLeftCorner,
          topRight: result.location.topRightCorner,
          bottomLeft: result.location.bottomLeftCorner,
          bottomRight: result.location.bottomRightCorner,
        }
      : undefined,
    width,
    height,
    note: result
      ? "QR berhasil didekode secara lokal dengan jsQR."
      : "Tidak ada QR yang terdeteksi. Coba crop area QR, tingkatkan kontras, atau gunakan gambar yang lebih tajam.",
  };
}
