export interface FinalReportInput {
  challengeName?: string;
  status: "Completed" | "Partially Completed";
  answer?: string;
  steps: string[];
  commands: string[];
  outputs: string[];
  verification: string;
}

function list(items: string[], max: number): string[] {
  return items.map((item) => item.trim()).filter(Boolean).slice(0, max);
}

/**
 * Concise final response format. Every line is derived from supplied evidence;
 * this formatter never infers or invents challenge facts.
 */
export function formatFinalReport(input: FinalReportInput): string {
  const steps = list(input.steps, 8);
  const commands = list(input.commands, 8);
  const outputs = list(input.outputs, 4);
  const shortSolution = [
    ...steps,
    commands.length ? `Perintah yang dijalankan: ${commands.join("; ")}` : "",
    outputs.length ? `Output penting: ${outputs.join(" | ")}` : "",
  ].filter(Boolean);
  if (!shortSolution.length) {
    shortSolution.push("Belum ada bukti eksekusi yang tersimpan untuk challenge ini.");
  }
  return [
    "CHALLENGE:",
    input.challengeName?.trim() || "(nama challenge tidak diberikan)",
    "",
    "STATUS:",
    input.status,
    "",
    "FINAL ANSWER:",
    input.answer?.trim() || "(belum ada jawaban terverifikasi)",
    "",
    "SHORT SOLUTION:",
    ...shortSolution.map((item, index) => `${index + 1}. ${item}`),
    "",
    "VERIFICATION:",
    input.verification.trim() || "Belum ada bukti verifikasi yang tersedia.",
  ].join("\n");
}
