export interface RecoveryInput {
  errorText: string;
  command: string;
  history: string[];
  category: string;
}

/**
 * Turns a real execution failure into a different, justified next action.
 * It never invents terminal output; it only chooses what to try next.
 */
export class ErrorRecoveryManager {
  suggest(input: RecoveryInput): string {
    const text = `${input.errorText} ${input.command}`.toLowerCase();
    if (/connection refused|connection reset|network is unreachable|timed out|name or service not known/.test(text)) {
      return "Koneksi gagal. Periksa host/port, lalu coba tool jaringan lain atau minta endpoint yang aktif.";
    }
    if (/command not found|not found|no such file/.test(text)) {
      return "Tool tidak tersedia. Pilih alternatif yang terdeteksi di image Kali, jangan paksakan perintah yang sama.";
    }
    if (/permission denied|operation not permitted|authenticated|host key/.test(text)) {
      return "Akses ditolak. Minta autorisasi atau kredensial yang sah sebelum melanjutkan.";
    }
    if (/timeout|timed out|execution expired/.test(text)) {
      return "Perintah melewati batas waktu. Pecah menjadi perintah kecil atau naikkan batas waktu jika diizinkan.";
    }
    if (/syntaxerror|traceback|invalid|unsupported/.test(text)) {
      return "Perintah atau solver ditolak. Perbaiki sintaks/format, lalu gunakan metode berbeda dari percobaan ini.";
    }
    if (input.history.some((item) => item.trim() === input.command.trim())) {
      return "Perintah identik pernah gagal. Gunakan tool atau hipotesis lain.";
    }
    return `Error dibaca: ${input.errorText.replace(/\s+/g, " ").trim().slice(0, 140)}. Ganti metode berdasarkan bukti ini.`;
  }
}
