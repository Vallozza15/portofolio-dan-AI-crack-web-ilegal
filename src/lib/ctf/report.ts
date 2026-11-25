import { generateLocalReport } from "./analyzer";
import type { CtfCategory, LocalAnalysisBundle, SessionMode, VerificationStatus } from "./types";

function transliterate(value: string): string {
  return value
    .replace(/\u2014|\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, "*")
    .replace(/\u2026/g, "...")
    .replace(/\u00d7/g, "x")
    .replace(/\u2192/g, "->")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

export function markdownToPlainLines(markdown: string): string[] {
  const source = markdown.replace(/\r\n/g, "\n");
  const output: string[] = [];
  let inFence = false;
  for (const rawLine of source.split("\n")) {
    let line = rawLine;
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(`    ${line}`);
      continue;
    }
    if (/^<!--.*-->$/.test(line.trim())) continue;
    if (/^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(line) && line.includes("-")) {
      continue;
    }
    line = line
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1");
    if (/^\s*---+\s*$/.test(line)) {
      output.push("------------------------------------------------------------");
      continue;
    }
    if (/^#{1,6}\s+/.test(line.trim())) {
      const heading = line.replace(/^#{1,6}\s+/, "").trim();
      if (output.length && output[output.length - 1] !== "") output.push("");
      output.push(heading.toUpperCase());
      output.push("");
      continue;
    }
    if (/^>\s?/.test(line.trim())) line = line.replace(/^>\s?/, "");
    output.push(line);
  }
  const cleaned: string[] = [];
  for (const line of output) {
    const value = line.replace(/\s+$/, "");
    if (value === "" && cleaned[cleaned.length - 1] === "") continue;
    cleaned.push(value);
  }
  return cleaned;
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > width) {
    let cut = remaining.lastIndexOf(" ", width);
    if (cut < width * 0.5) cut = width;
    result.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) result.push(remaining);
  return result;
}

function escapePdfText(value: string): string {
  return transliterate(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function contentStream(lines: string[], title: string, subtitle: string): string {
  const commands: string[] = ["BT", "/F2 13 Tf", "14 TL", "50 792 Td", `(${escapePdfText(title)}) Tj`, "T*", "/F1 8 Tf", "11 TL", `(${escapePdfText(subtitle)}) Tj`, "T*", "T*", "/F1 9 Tf", "12 TL"];
  for (const line of lines) {
    if (!line) {
      commands.push("T*");
      continue;
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
    commands.push("T*");
  }
  commands.push("ET");
  return commands.join("\n");
}

export function markdownToPdf(markdown: string, title: string, generatedAt = new Date()): Buffer {
  const width = 96;
  const linesPerPage = 54;
  const wrapped: string[] = [];
  for (const line of markdownToPlainLines(markdown)) {
    wrapped.push(...wrapLine(line, width));
  }
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += linesPerPage) {
    pages.push(wrapped.slice(index, index + linesPerPage));
  }
  if (!pages.length) pages.push([]);

  const pageCount = pages.length;
  const font1 = 3 + pageCount;
  const font2 = font1 + 1;
  const firstContent = font2 + 1;
  const objects: string[] = [];
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => 3 + index);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  const subtitle = `CTF Intelligence - ${generatedAt.toLocaleString("id-ID")}`;
  pages.forEach((pageLines, index) => {
    const pageNumber = 3 + index;
    const contentNumber = firstContent + index;
    objects[pageNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    const stream = contentStream(pageLines, title, `${subtitle} - halaman ${index + 1}/${pageCount}`);
    objects[contentNumber] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  objects[font1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[font2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  const maxObject = objects.length - 1;
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets: number[] = new Array(maxObject + 1).fill(0);
  for (let number = 1; number <= maxObject; number += 1) {
    offsets[number] = offset;
    const body = `${number} 0 obj\n${objects[number] || "<< >>"}\nendobj\n`;
    const buffer = Buffer.from(body, "latin1");
    chunks.push(buffer);
    offset += buffer.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= maxObject; number += 1) {
    xref += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

export function reportFilename(title: string, extension: "md" | "pdf"): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "ctf-report";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.${extension}`;
}

export interface ReportDraft {
  title: string;
  category: CtfCategory;
  markdown: string;
  status: VerificationStatus;
}

export function buildReportDraft(
  bundle: LocalAnalysisBundle,
  mode: SessionMode = "learning",
  language: "id" | "en" = "id",
): ReportDraft {
  return {
    title: `Laporan CTF — ${bundle.title}`,
    category: bundle.category,
    markdown: generateLocalReport(bundle, mode, language),
    status: bundle.status,
  };
}
