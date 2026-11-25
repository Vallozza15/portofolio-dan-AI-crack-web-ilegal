import { normalizeCommand } from "../reasoning/anti-repetition";
import type { RepetitionCheck } from "./types";

const CALLER_NOTE =
  "Pengecualian untuk verifikasi yang esensial dikelola oleh pemanggil, bukan oleh mesin pengulangan ini.";

export class AntiRepetitionEngine {
  check(command: string, history: string[], maxRepeated: number): RepetitionCheck {
    const normalized = normalizeCommand(command);
    const limit = Number.isFinite(maxRepeated) ? Math.max(0, Math.floor(maxRepeated)) : 0;
    const count = normalized
      ? history.reduce((total, entry) => total + (normalizeCommand(entry) === normalized ? 1 : 0), 0)
      : 0;
    const repeated = normalized.length > 0 && count > limit;
    const reason = repeated
      ? `Perintah "${normalized}" muncul ${count} kali dalam riwayat; batas pengulangan ${limit}. ${CALLER_NOTE}`
      : `Tidak ada pengulangan melebihi batas ${limit}. ${CALLER_NOTE}`;

    return { repeated, normalized, reason };
  }
}
