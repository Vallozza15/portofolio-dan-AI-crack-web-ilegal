import { authorizeRemoteEndpoint } from "./config";
import type {
  InterpretationInput,
  RemoteAuthMethod,
  RemoteOperation,
  StructuredPlan,
} from "./types";

type SecretField = "password" | "privateKey" | "passphrase";

interface ExtractedSecret {
  field: SecretField;
  value: string;
}

interface TargetDraft {
  profileId?: string;
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  authMethod?: RemoteAuthMethod;
  fingerprint?: string;
  challengeId?: string;
  remoteCwd?: string;
  path?: string;
  envRefs: string[];
}

interface OperationRule {
  operation: RemoteOperation;
  pattern: RegExp;
  reasonId: string;
  reasonEn: string;
  expectedId: string;
  expectedEn: string;
}

const PEM_RE = /-----BEGIN(?:[A-Z0-9 ]+)?PRIVATE KEY-----[\s\S]*?-----END(?:[A-Z0-9 ]+)?PRIVATE KEY-----/gi;
const ENV_REF_RE = /\b(password|private[\s_-]?key|passphrase)\s+(?:[:=]\s*)?(?:env|dari\s+env|from\s+env)\s+([A-Z][A-Z0-9_]*)\b/gi;
const SECRET_RE = /\b(password|passwd|pass|passphrase|private[\s_-]?key)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\s,;]+))/gi;

const OPERATION_RULES: OperationRule[] = [
  {
    operation: "STOP",
    pattern: /\b(stop|berhenti|hentikan|jangan\s+(?:lanjut|jalankan)|cancel|abort)\b/i,
    reasonId: "Permintaan penghentian eksekusi terdeteksi.",
    reasonEn: "A stop request was detected.",
    expectedId: "Eksekusi otomatis dihentikan.",
    expectedEn: "Automated execution is stopped.",
  },
  {
    operation: "DISCONNECT",
    pattern: /\b(disconnect|putuskan|tutup\s+koneksi|keluar\s+dari\s+server|logout|close\s+connection)\b/i,
    reasonId: "Permintaan memutus koneksi remote terdeteksi.",
    reasonEn: "A request to disconnect the remote session was detected.",
    expectedId: "Koneksi remote ditutup.",
    expectedEn: "The remote connection is closed.",
  },
  {
    operation: "CHECK_STATUS",
    pattern: /^(?:status|state|progress)[?.!\s]*$|\b(?:cek\s+status|check\s+status|status\s+(?:challenge|koneksi|connection|sekarang)|sejauh\s+mana|sudah\s+sampai\s+mana|how\s+far)\b/i,
    reasonId: "Permintaan pemeriksaan status terdeteksi.",
    reasonEn: "A status check was detected.",
    expectedId: "Status sesi dan challenge dilaporkan.",
    expectedEn: "The session and challenge status is reported.",
  },
  {
    operation: "VERIFY_ANSWER",
    pattern: /\b(?:check|verify|confirm|validate|periksa|cek|verifikasi|validasi)\w*\b[^.!?\n]*\b(?:answer|jawaban|flag|hasil)\w*\b|\b(?:answer|jawaban|flag|hasil)\w*\b[^.!?\n]*\b(?:check|verify|confirm|validate|periksa|cek|verifikasi|validasi)\w*\b/i,
    reasonId: "Permintaan verifikasi ulang jawaban terdeteksi.",
    reasonEn: "A request to re-verify the answer was detected.",
    expectedId: "Jawaban diverifikasi ulang dari bukti yang tersimpan, bukan ditebak.",
    expectedEn: "The answer is re-verified from stored evidence, not guessed.",
  },
  {
    operation: "EXPLAIN_SOLUTION",
    pattern: /\b(jelaskan|explain|how\s+did\s+you|bagaimana\s+kamu|laporan\s+akhir|final\s+report|penjelasan\s+solusi)\b[^.!?\n]*\b(selesai|menyelesaikan|menyelesaikannya|penyelesaian|solve|solved|jawaban|answer|flag|solusi|solution|challenge)\b|\b(explanation|penjelasan\s+penyelesaian)\b/i,
    reasonId: "Permintaan penjelasan dari riwayat eksekusi nyata terdeteksi.",
    reasonEn: "A request for an explanation from real execution history was detected.",
    expectedId: "Penjelasan disusun dari perintah, output, dan verifikasi yang benar-benar tersimpan.",
    expectedEn: "The explanation is composed only from stored commands, outputs and verification.",
  },
  {
    operation: "REQUEST_REPORT",
    pattern: /\b(report|laporan|ringkasan\s+hasil|ask\s+for\s+a\s+report|minta\s+laporan)\b/i,
    reasonId: "Permintaan laporan hasil terdeteksi.",
    reasonEn: "A request for a result report was detected.",
    expectedId: "Laporan ringkas hasil analisis disiapkan.",
    expectedEn: "A concise result report is prepared.",
  },
  {
    operation: "NETCAT_CONNECT",
    pattern: /^\s*(?:nc|netcat)\s+[A-Za-z0-9._:-]+(?:\s+\d{1,5})?\b|\b(?:buka|hubungi|konek|connect|jalankan|run)\b[^.!?\n]*\b(?:nc|netcat)\b/i,
    reasonId: "Perintah koneksi nc/netcat terdeteksi; hanya endpoint yang diizinkan operator yang dijalankan.",
    reasonEn: "An nc/netcat connection was detected; only operator-authorized endpoints are run.",
    expectedId: "Koneksi dibuat di terminal Kali dan outputnya diperiksa untuk mencari flag.",
    expectedEn: "The connection is made in the Kali terminal and its output is examined for a flag.",
  },
  {
    operation: "GIT_CLONE",
    pattern: /\bgit\s+clone\b|\bclone\b[^.!?\n]*\b(?:repo|repository|challenge)\b/i,
    reasonId: "Perintah clone repository terdeteksi; koneksi dijalankan di terminal Kali.",
    reasonEn: "A repository clone was detected; the connection runs in the Kali terminal.",
    expectedId: "Repository di-clone ke /work/challenge dan isinya dianalisis.",
    expectedEn: "The repository is cloned into /work/challenge and its contents are analyzed.",
  },
  {
    operation: "AUTO_ANALYZE",
    pattern: /\b(analisis|analyze|analyse|periksa|inspect|check|jalankan|run|pakai|use|tool|tools|kali|terminal|otomatiskan|automate|kerjakan|solve|selesaikan|ekstrak|extract|buka)\b[^.!?\n]*\b(file|berkas|lampiran|attachment|challenge|soal|image|gambar|pcap|binary|biner|string|flag|stego|metadata|hex|base64|dump)\b|\b(file|berkas|lampiran|attachment|challenge|soal)\b[^.!?\n]*\b(analisis|analyze|analyse|periksa|inspect|check|jalankan|run|pakai|use|kerjakan|solve|selesaikan)\b/i,
    reasonId: "Permintaan analisis otomatis dengan tool Kali terdeteksi.",
    reasonEn: "A request for automatic analysis with Kali tools was detected.",
    expectedId: "Tool Kali dijalankan otomatis pada berkas/konteks yang tersedia.",
    expectedEn: "Kali tools are run automatically on the available files and context.",
  },
  {
    operation: "SAVE_PROFILE",
    pattern: /\b(save|simpan)\b[^.!?\n]*\b(profile|profil|koneksi)\b/i,
    reasonId: "Permintaan menyimpan profil koneksi terdeteksi.",
    reasonEn: "A request to save a connection profile was detected.",
    expectedId: "Profil disimpan sebagai metadata, tanpa menyimpan rahasia dalam teks biasa.",
    expectedEn: "The profile is stored as metadata, with secrets kept out of plain text.",
  },
  {
    operation: "SOLVE_UNTIL_FLAG",
    pattern: /\b(until\s+(?:the\s+)?final\s+flag|sampai\s+(?:flag\s+)?(?:akhir|final)|terus\s+(?:sampai|hingga)\s+flag|solve\s+until|selesaikan\s+sampai|continue\s+until|find\s+(?:the\s+)?flag|cari\s+(?:flag|bendera)|temukan\s+flag|dapatkan\s+flag|get\s+(?:the\s+)?flag)\b/i,
    reasonId: "Permintaan melanjutkan analisis hingga flag akhir terdeteksi.",
    reasonEn: "A request to continue until the final flag was detected.",
    expectedId: "Analisis berlanjut sampai flag terverifikasi atau eksekusi dihentikan.",
    expectedEn: "Analysis continues until a verified flag or a stop condition.",
  },
  {
    operation: "CONNECT_REMOTE",
    pattern: /\b(connect|hubungkan|hubungi|konek|ssh|login|masuk\s+(?:ke|dalam)|terhubung|remote\s+into)\b/i,
    reasonId: "Permintaan koneksi remote terdeteksi; hanya endpoint yang diizinkan operator yang diproses.",
    reasonEn: "A remote connection request was detected; only operator-authorized endpoints are processed.",
    expectedId: "Koneksi remote dibuat hanya jika semua informasi wajib tersedia dan diizinkan.",
    expectedEn: "A remote connection is made only when all required details are present and authorized.",
  },
  {
    operation: "INVESTIGATE_NEXT_STAGE",
    pattern: /\b(next\s+stage|tahap\s+(?:berikutnya|selanjutnya)|stage\s*\d|level\s*\d+\s*(?:berikutnya|next)|lanjut\s+ke\s+tahap|investigate\s+next)\b/i,
    reasonId: "Permintaan menyelidiki tahap berikutnya terdeteksi.",
    reasonEn: "A request to investigate the next stage was detected.",
    expectedId: "Tahap berikutnya diperiksa dari bukti terminal yang tersedia.",
    expectedEn: "The next stage is examined from available terminal evidence.",
  },
  {
    operation: "READ_TERMINAL",
    pattern: /\b(?:read|baca|lihat|tampilkan|show)\b[^.!?\n]*\b(?:terminal|output|stdout|stderr|log)\b|\b(?:terminal|output)\b[^.!?\n]*\b(?:read|baca|dibaca)\b|\b(?:hidden|tersembunyi|rahasia)\b[^.!?\n]*\b(?:instruction|instruksi|petunjuk|message|pesan)\b/i,
    reasonId: "Permintaan membaca output terminal atau instruksi tersembunyi terdeteksi.",
    reasonEn: "A request to read terminal output or hidden instructions was detected.",
    expectedId: "Output terminal dibaca dan observasi dicatat apa adanya.",
    expectedEn: "Terminal output is read and observations are recorded verbatim.",
  },
  {
    operation: "FOLLOW_HINT",
    pattern: /\b(?:follow|ikuti|turuti|berdasarkan|based\s+on)\b[^.!?\n]*\b(?:hint|petunjuk|clue)\b|\b(?:hint|petunjuk|clue)\b[^.!?\n]*\b(?:follow|ikuti|gunakan|use|pakai)\b|\b(?:ada|gunakan)\s+(?:kah\s+)?petunjuk\b|\b(?:baca|read|lihat)\s+(?:the\s+)?(?:hint|petunjuk|clue)\b/i,
    reasonId: "Permintaan mengikuti petunjuk terdeteksi.",
    reasonEn: "A request to follow a hint was detected.",
    expectedId: "Petunjuk ditafsirkan hanya dengan bukti yang mendukung.",
    expectedEn: "Hints are interpreted only with supporting evidence.",
  },
  {
    operation: "DECODE_MESSAGE",
    pattern: /\b(decode|dekode|decrypt|dekripsi|pecahkan\s+sandi|ubah\s+encoding|terjemahkan\s+sandi)\b/i,
    reasonId: "Permintaan mendekode pesan terdeteksi.",
    reasonEn: "A request to decode a message was detected.",
    expectedId: "Pesan didekode dengan metode yang memiliki bukti pendukung.",
    expectedEn: "The message is decoded using methods with supporting evidence.",
  },
  {
    operation: "CONTINUE_CHALLENGE",
    pattern: /\b(continue|lanjut|lanjutkan|kelanjutannya|selanjutnya|next\s+step|do\s+it|kerjakan|selesaikan|solve|coba\s+(?:cara|pendekatan|metode)\s+(?:lain|berbeda)|try\s+(?:another|a\s+different)\s+(?:approach|method|way)|retry|ulangi|wrong\s+approach|pendekatan\s+(?:lain|salah))\b/i,
    reasonId: "Permintaan melanjutkan challenge terdeteksi.",
    reasonEn: "A request to continue the challenge was detected.",
    expectedId: "Analisis dilanjutkan dari tahap saat ini.",
    expectedEn: "Analysis continues from the current stage.",
  },
  {
    operation: "INSPECT_REMOTE",
    pattern: /\b(inspect|periksa|cek|check|enumerate|list|examine|lihat\s+isi|investigate)\b/i,
    reasonId: "Permintaan memeriksa server atau remote terdeteksi.",
    reasonEn: "A request to inspect the remote server was detected.",
    expectedId: "Informasi remote diperiksa tanpa mengubah keadaan server.",
    expectedEn: "Remote information is inspected without changing server state.",
  },
];

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[1]?.trim() || undefined;
}

function normalizeAuthMethod(raw: string | undefined): RemoteAuthMethod | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (value.includes("privatekey") || value.includes("sshkey")) return "privateKey";
  if (value.includes("agent")) return "agent";
  if (value.includes("password") || value.includes("pass")) return "password";
  return undefined;
}

function secretField(raw: string): SecretField {
  const value = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (value === "passphrase") return "passphrase";
  if (value.includes("privatekey")) return "privateKey";
  return "password";
}

/** Redacts only explicitly labelled secrets and PEM blocks; env references are metadata, not secrets. */
function redactSecrets(question: string): { redacted: string; secrets: ExtractedSecret[]; envRefs: string[] } {
  const secrets: ExtractedSecret[] = [];
  const envRefs: string[] = [];
  let working = question;

  working = working.replace(ENV_REF_RE, (match, field: string, envName: string) => {
    const normalizedField = secretField(field);
    const key = `${normalizedField}Env`;
    const entry = `${key}=${envName}`;
    if (!envRefs.includes(entry)) envRefs.push(entry);
    const index = envRefs.indexOf(entry);
    return `\u0000ENVREF${index}\u0000`;
  });

  working = working.replace(PEM_RE, (match) => {
    secrets.push({ field: "privateKey", value: match });
    return "[REDACTED_PRIVATE_KEY]";
  });

  working = working.replace(
    SECRET_RE,
    (match, label: string, quotedDouble?: string, quotedSingle?: string, bare?: string) => {
      const value = (quotedDouble ?? quotedSingle ?? bare ?? "").trim();
      if (!value) return "[REDACTED_SECRET]";
      secrets.push({ field: secretField(label), value });
      return `[REDACTED_${secretField(label).toUpperCase()}]`;
    },
  );

  const redacted = working.replace(/\u0000ENVREF(\d+)\u0000/g, (_, indexText: string) => {
    const entry = envRefs[Number(indexText)];
    if (!entry) return "[REDACTED_SECRET]";
    const separator = entry.indexOf("=");
    const field = entry.slice(0, separator).replace(/Env$/, "");
    const envName = entry.slice(separator + 1);
    const label = field === "privateKey" ? "private key" : field;
    return `${label} env ${envName}`;
  });

  return { redacted, secrets, envRefs };
}

function extractTarget(text: string, envRefs: string[], secrets: ExtractedSecret[]): TargetDraft {
  const draft: TargetDraft = { envRefs };

  draft.name = firstMatch(text, /\b(?:profile|profil)\s*(?:nama|name)\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i);
  draft.profileId = firstMatch(text, /\b(?:profile|profil)\s*id\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i);
  const bareProfile = firstMatch(text, /\b(?:profile|profil)\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i);
  if (bareProfile && !draft.name && !draft.profileId) {
    draft.name = bareProfile;
    draft.profileId = bareProfile;
  }

  const hostPattern = /\b(?:host|server|alamat|address|target)\s*(?:name)?\s*[:=]?\s*(\[[0-9A-Fa-f:]+\]|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost)/i;
  draft.host = firstMatch(text, hostPattern);

  const ncTarget = /^\s*(?:nc|netcat)\s+(\[[0-9A-Fa-f:]+\]|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost)(?:\s+(\d{1,5}))?\b/i.exec(text);
  if (ncTarget) {
    draft.host = draft.host ?? ncTarget[1];
    if (ncTarget[2]) draft.port = Number(ncTarget[2]);
  }

  const userHost = /\b([A-Za-z0-9._-]+)@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost)\b/i.exec(text);
  if (userHost) {
    draft.username = draft.username ?? userHost[1];
    draft.host = draft.host ?? userHost[2];
  }

  const sshUrl = /\bssh:\/\/([A-Za-z0-9._-]+)@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost):(\d{1,5})(\/[A-Za-z0-9._~+\/-]+)/i.exec(text);
  if (sshUrl) {
    const parsedPort = Number(sshUrl[3]);
    draft.username = draft.username ?? sshUrl[1];
    draft.host = draft.host ?? sshUrl[2];
    if (Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) draft.port = parsedPort;
    draft.path = sshUrl[4];
  }

  const rawPort = firstMatch(text, /\b(?:port|p)\s*[:=]?\s*(\d{1,5})\b/i) ?? firstMatch(text, /-p\s*(\d{1,5})\b/i);
  if (rawPort) {
    const parsed = Number(rawPort);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) draft.port = parsed;
  }

  draft.username =
    draft.username ??
    firstMatch(text, /\b(?:username|user|pengguna|login\s+as)\s*[:=]?\s*([A-Za-z0-9._-]{1,64})\b/i);
  draft.authMethod = normalizeAuthMethod(
    firstMatch(text, /\b(?:auth|autentikasi|authentication|login\s+dengan)\s*[:=]?\s*(password|private[\s_-]?key|privatekey|agent|ssh[\s_-]?key)/i),
  );
  if (!draft.authMethod) {
    if (secrets.some((item) => item.field === "privateKey")) draft.authMethod = "privateKey";
    else if (secrets.some((item) => item.field === "password")) draft.authMethod = "password";
    else if (envRefs.some((entry) => entry.startsWith("privateKeyEnv="))) draft.authMethod = "privateKey";
    else if (envRefs.some((entry) => entry.startsWith("passwordEnv="))) draft.authMethod = "password";
  }

  draft.fingerprint = firstMatch(
    text,
    /\b(?:fingerprint|sidik\s+jari|host[\s_-]?key)\s*[:=]?\s*(SHA256:?[A-Za-z0-9+/=_-]{8,}|MD5:?[A-Fa-f0-9:]{8,}|[A-Fa-f0-9]{2}(?::[A-Fa-f0-9]{2}){7,})/i,
  );
  draft.challengeId = firstMatch(text, /\b(?:challenge|chall|soal)\s*(?:id)?\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i);
  draft.remoteCwd = firstMatch(text, /\b(?:cwd|workdir|working\s+dir(?:ectory)?|direktori|folder)\s*[:=]?\s*(\/[A-Za-z0-9._~+\/-]*)/i);

  return draft;
}

function detectOperation(text: string): OperationRule {
  for (const rule of OPERATION_RULES) {
    if (rule.pattern.test(text)) return rule;
  }
  return {
    operation: "GENERAL_QUESTION",
    pattern: /$/,
    reasonId: "Pertanyaan umum terdeteksi; tidak ada operasi remote yang diminta.",
    reasonEn: "A general question was detected; no remote operation was requested.",
    expectedId: "Jawaban umum diberikan tanpa tindakan remote.",
    expectedEn: "A general answer is given without any remote action.",
  };
}

function environmentFor(operation: RemoteOperation): "local-kali" | "remote-ctf" {
  if (operation === "AUTO_ANALYZE" || operation === "NETCAT_CONNECT" || operation === "GIT_CLONE" || operation === "READ_TERMINAL" || operation === "DECODE_MESSAGE" || operation === "REQUEST_REPORT" || operation === "GENERAL_QUESTION" || operation === "STOP") {
    return "local-kali";
  }
  return "remote-ctf";
}

export class NaturalLanguageCommandInterpreter {
  interpret(input: InterpretationInput): StructuredPlan {
    const { redacted, secrets, envRefs } = redactSecrets(input.question);
    const target = extractTarget(redacted, envRefs, secrets);
    const rule = detectOperation(redacted);
    const isIndonesian = input.language === "id";

    const requirements: string[] = [];
    if (target.profileId) requirements.push(`profileId=${target.profileId}`);
    if (target.name) requirements.push(`name=${target.name}`);
    if (target.host) requirements.push(`host=${target.host}`);
    if (target.port !== undefined) requirements.push(`port=${target.port}`);
    if (target.username) requirements.push(`username=${target.username}`);
    if (target.authMethod) requirements.push(`authMethod=${target.authMethod}`);
    if (target.fingerprint) requirements.push(`fingerprint=${target.fingerprint}`);
    if (target.challengeId) requirements.push(`challengeId=${target.challengeId}`);
    if (target.remoteCwd) requirements.push(`remoteCwd=${target.remoteCwd}`);
    if (target.path) requirements.push(`path=${target.path}`);
    requirements.push(...envRefs);

    const missing: string[] = [];
    let reason = isIndonesian ? rule.reasonId : rule.reasonEn;

    if (rule.operation === "CONNECT_REMOTE") {
      requirements.push(isIndonesian ? "otorisasi endpoint wajib" : "endpoint authorization required");
      const profile = target.profileId ?? target.name ?? input.activeProfileId;
      // A referenced profile is enough by itself. Otherwise the four inline
      // essentials must be present; port defaults to 22 and is not required.
      const hasInlineConnection = Boolean(
        target.host && target.username && target.fingerprint && target.authMethod,
      );
      if (!profile && !hasInlineConnection) {
        const essentials: Array<[string, string | undefined]> = [
          ["host", target.host],
          ["username", target.username],
          ["authMethod", target.authMethod],
          ["fingerprint", target.fingerprint],
        ];
        for (const [key, value] of essentials) {
          if (!value && !missing.includes(key)) missing.push(key);
        }
      }

      if (target.host && target.port !== undefined) {
        const authorization = authorizeRemoteEndpoint(target.host, target.port);
        if (!authorization.ok) {
          reason += ` ${authorization.reason}`;
          const key = /port/i.test(authorization.reason) ? "port" : "host";
          if (!missing.includes(key)) missing.push(key);
        }
      }
    }

    if (rule.operation === "NETCAT_CONNECT") {
      if (!target.host) missing.push("host");
      if (target.port === undefined) missing.push("port");
      if (target.host && target.port !== undefined) {
        const authorization = authorizeRemoteEndpoint(target.host, target.port);
        if (!authorization.ok) {
          reason += ` ${authorization.reason}`;
          const key = /port/i.test(authorization.reason) ? "port" : "host";
          if (!missing.includes(key)) missing.push(key);
        }
      }
    }

    if (rule.operation === "GIT_CLONE") {
      if (!target.host) missing.push("host");
      if (target.port === undefined) missing.push("port");
      if (!target.path) missing.push("path");
      if (target.host && target.port !== undefined) {
        const authorization = authorizeRemoteEndpoint(target.host, target.port);
        if (!authorization.ok) {
          reason += ` ${authorization.reason}`;
          const key = /port/i.test(authorization.reason) ? "port" : "host";
          if (!missing.includes(key)) missing.push(key);
        }
      }
    }

    const stateChange = rule.operation === "SAVE_PROFILE";

    return {
      operation: rule.operation,
      confidence: rule.operation === "GENERAL_QUESTION" ? 0.6 : 0.9,
      reason,
      target: {
        profileId: target.profileId ?? input.activeProfileId,
        name: target.name,
        host: target.host,
        port: target.port,
        username: target.username,
        authMethod: target.authMethod,
        fingerprint: target.fingerprint,
        remoteCwd: target.remoteCwd,
        challengeId: target.challengeId,
        path: target.path,
      },
      requirements,
      session: {
        sessionId: input.sessionId,
        challengeId: target.challengeId ?? input.challengeId,
        environment: environmentFor(rule.operation),
      },
      permissions: {
        stateChange,
        reason: stateChange
          ? isIndonesian
            ? "Menyimpan profil mengubah penyimpanan lokal."
            : "Saving a profile changes local storage."
          : undefined,
      },
      expectedResult: isIndonesian ? rule.expectedId : rule.expectedEn,
      missing,
      ...(secrets.length ? { extractedSecrets: secrets } : {}),
      redactedQuestion: redacted,
    };
  }
}
