import type { RemoteOperation, StructuredPlan } from "./types";

export interface StepOutcomeInput {
  commandStatus: "ok" | "error" | "blocked";
  exitCode: number | null;
  stderr: string;
  output: string;
  failureIndicators: string[];
  successIndicators: string[];
  continuationSignals: string[];
  candidates: Array<{ value: string }>;
  completion: { completed: boolean; status: string; flag?: string; reason: string };
  selectedClue?: string;
}

export interface StepOutcome {
  interpretation: string;
  result: string;
  nextAction: string;
}

const clip = (value: string, limit = 160) => value.replace(/\s+/g, " ").trim().slice(0, limit);

/** Turns real command output into human-readable step interpretation. */
export function describeStepOutcome(input: StepOutcomeInput): StepOutcome {
  if (input.commandStatus !== "ok") {
    const failure = input.failureIndicators[0] || clip(input.stderr || input.output, 120);
    return {
      interpretation: failure
        ? `Output nyata menunjukkan kegagalan: ${clip(failure)}.`
        : "Perintah gagal sehingga output tidak dipakai sebagai bukti.",
      result: `exit ${input.exitCode ?? "—"}; tidak ada hasil yang dapat diverifikasi.`,
      nextAction: "Baca error, lalu ganti perintah atau tool alternatif.",
    };
  }
  if (input.completion.completed) {
    return {
      interpretation: "Server/oracle menandai challenge selesai.",
      result: input.completion.flag
        ? `Flag terverifikasi: ${input.completion.flag}`
        : `Status akhir: ${input.completion.status}`,
      nextAction: "Laporkan hasil yang sudah terverifikasi.",
    };
  }
  if (input.continuationSignals.length) {
    return {
      interpretation: `Instruksi lanjutan terdeteksi: ${clip(input.continuationSignals[0], 120)}.`,
      result: "Ada tahap berikutnya yang belum diselesaikan.",
      nextAction: "Ikuti instruksi lanjutan pada langkah berikutnya.",
    };
  }
  const candidate = input.candidates[0]?.value;
  if (candidate) {
    return {
      interpretation: "Kandidat flag ditemukan dari output/dekode, tetapi belum ada penerimaan server.",
      result: `Kandidat belum terverifikasi: ${clip(candidate, 120)}`,
      nextAction: "Verifikasi kandidat ke server/oracle sebelum melaporkannya.",
    };
  }
  const success = input.successIndicators[0];
  return {
    interpretation: success
      ? `Output menunjukkan keberhasilan: ${clip(success)}.`
      : "Perintah berhasil dan output sudah dibaca sebagai bukti.",
    result: `exit ${input.exitCode ?? 0}; output diterima, flag belum terverifikasi.`,
    nextAction: input.selectedClue
      ? `Gunakan petunjuk terbaca (${clip(input.selectedClue, 100)}) untuk memilih metode berikutnya.`
      : "Pilih metode berikutnya dari petunjuk dan output yang ada.",
  };
}

export interface StepMeta {
  title: string;
  objective: string;
  reason: string;
  expected: string;
  nextAction: string;
}

const OPERATION_TITLES: Partial<Record<RemoteOperation, string>> = {
  GIT_CLONE: "Ambil repository challenge",
  NETCAT_CONNECT: "Hubungkan ke server challenge",
  AUTO_ANALYZE: "Analisis artefak dengan tool Kali",
  CONNECT_REMOTE: "Hubungkan ke server CTF",
  READ_TERMINAL: "Baca kondisi terminal",
  DECODE_MESSAGE: "Dekode pesan/teks",
  SOLVE_UNTIL_FLAG: "Telusuri solusi challenge",
  CONTINUE_CHALLENGE: "Lanjutkan tahap challenge",
  INVESTIGATE_NEXT_STAGE: "Investigasi tahap berikutnya",
  FOLLOW_HINT: "Ikuti petunjuk challenge",
};

export function buildStepMeta(plan: StructuredPlan, iteration: number): StepMeta {
  const baseTitle = OPERATION_TITLES[plan.operation] || "Jalankan perintah Kali";
  if (iteration === 0) {
    return {
      title: baseTitle,
      objective: "Kumpulkan bukti awal yang dibutuhkan untuk memahami challenge.",
      reason: "Perintah awal dipilih untuk mengumpulkan bukti tanpa menebak solusi.",
      expected: "Output berisi daftar file, teks petunjuk, atau respons server.",
      nextAction: "Baca output nyata, lalu tentukan metode lanjutan.",
    };
  }
  if (plan.operation === "GIT_CLONE" && iteration === 1) {
    return {
      title: "Inventarisasi repository",
      objective: "Daftarkan file yang berhasil di-clone untuk menemukan titik masuk analisis.",
      reason: "Isi repository harus diketahui sebelum memilih file yang akan dianalisis.",
      expected: "Daftar file di /work/challenge beserta ukurannya.",
      nextAction: "Pilih file paling relevan dan periksa isinya.",
    };
  }
  return {
    title: `${baseTitle} — langkah ${iteration + 1}`,
    objective: "Uji hipotesis berikutnya berdasarkan output langkah sebelumnya.",
    reason: "Hipotesis baru perlu diuji dengan perintah yang berbeda dari percobaan gagal.",
    expected: "Output yang dapat membedakan hipotesis tersebut dari temuan sebelumnya.",
    nextAction: "Bandingkan hasil dengan temuan sebelumnya sebelum melanjutkan.",
  };
}
