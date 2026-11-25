import { operationalMessage, type OperationalKey } from "./config";
import type { AutonomousLanguage, ChallengeFinalStatus } from "./types";

export interface FinalResponseInput {
  language: AutonomousLanguage;
  status: ChallengeFinalStatus;
  flag?: string;
  missing?: string[];
  note?: string;
}

export class UserResponseController {
  message(language: AutonomousLanguage, key: OperationalKey): string {
    return operationalMessage(language, key);
  }

  final(input: FinalResponseInput): string {
    const { language, status, flag, missing, note } = input;
    const isIndonesian = language === "id";

    if ((status === "COMPLETED" || status === "VERIFIED") && flag) {
      return note ? `Flag: ${flag}. ${note}` : `Flag: ${flag}`;
    }

    if (missing && missing.length) {
      const label = isIndonesian ? "Dibutuhkan" : "Required";
      return `${label}: ${missing.join(", ")}.`;
    }

    if (status === "COMPLETED" || status === "VERIFIED") {
      return operationalMessage(language, "completed");
    }

    if (status === "POTENTIAL_FLAG") {
      if (flag) {
        return isIndonesian
          ? `Kandidat flag: ${flag}. Belum terverifikasi.`
          : `Flag candidate: ${flag}. Not yet verified.`;
      }
      return isIndonesian ? "Kandidat flag belum terverifikasi." : "Flag candidate is not verified yet.";
    }

    if (status === "INTERMEDIATE") return operationalMessage(language, "intermediate");
    if (note) return note;
    return isIndonesian ? "Challenge belum terselesaikan." : "The challenge is not solved yet.";
  }
}
