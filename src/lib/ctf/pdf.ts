import { inflateSync } from "node:zlib";
import { extractFlagCandidates } from "./flag";
import { safePreview } from "./file-utils";
import type { FlagCandidate, PdfInfo } from "./types";

export interface PdfResult {
  info: PdfInfo;
  flags: FlagCandidate[];
  text: string;
  trailing?: { offset: number; length: number; preview: string };
}

function extractPdfString(buffer: Buffer, key: string) {
  const regex = new RegExp(`/${key}\\s*\\(([^)]{0,500})\\)`, "i");
  const match = buffer.toString("latin1").match(regex);
  return match?.[1]?.replace(/\\([()\\])/g, "$1");
}

export function parsePdf(buffer: Buffer): PdfResult {
  const head = buffer.subarray(0, 16).toString("latin1");
  const versionMatch = head.match(/%PDF-(\d\.\d)/);
  if (!versionMatch) throw new Error("Header %PDF tidak ditemukan.");
  const raw = buffer.toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  const objects = (raw.match(/\b\d+\s+\d+\s+obj\b/g) || []).length;
  const info: PdfInfo = {
    version: versionMatch[1],
    pages,
    producer: extractPdfString(buffer, "Producer"),
    creator: extractPdfString(buffer, "Creator"),
    hasJavaScript: /\/JavaScript|\/JS\b/.test(raw),
    hasEmbeddedFiles: /\/EmbeddedFile/.test(raw),
    hasOpenAction: /\/OpenAction/.test(raw),
    objects,
  };
  const flags = new Map<string, FlagCandidate>();
  for (const candidate of extractFlagCandidates(raw, "PDF raw content")) {
    if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
  }

  const decoded: string[] = [];
  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  let budget = 8 * 1024 * 1024;
  while ((match = streamRegex.exec(raw)) && budget > 0) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dictStart = Math.max(0, match.index - 500);
    const dictionary = raw.slice(dictStart, match.index);
    if (!/\/FlateDecode/.test(dictionary)) continue;
    const compressed = buffer.subarray(start, end);
    try {
      const output = inflateSync(compressed, { maxOutputLength: Math.min(budget, 4 * 1024 * 1024) });
      budget -= output.length;
      const text = output.toString("utf8");
      if (text.length > 0) {
        decoded.push(text);
        for (const candidate of extractFlagCandidates(text, "PDF FlateDecode stream")) {
          if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
        }
      }
    } catch {
      // Many PDF streams are not plain zlib or are truncated; skip quietly.
    }
  }

  const lastEof = raw.lastIndexOf("%%EOF");
  const trailing = lastEof >= 0 && lastEof + 5 < buffer.length
    ? {
        offset: lastEof + 5,
        length: buffer.length - (lastEof + 5),
        preview: safePreview(buffer.subarray(lastEof + 5, lastEof + 245).toString("latin1"), 240),
      }
    : undefined;
  info.trailingBytes = trailing?.length;

  return {
    info,
    flags: [...flags.values()],
    text: decoded.join("\n").slice(0, 200_000),
    trailing,
  };
}
