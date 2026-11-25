import type { CommandValidation } from "./autonomous/types";

interface RemoteCommandPolicy {
  allowStateChange?: boolean;
  authorizedHost?: string;
}

const BLOCKED_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sudo|doas|pkexec|su\s+-)\b/i, "Escalasi privilege tidak diizinkan."],
  [/\b(?:docker|podman|nerdctl|ctr|runc|kubectl)\b/i, "Runtime container tidak diizinkan dari shell remote."],
  [/\b(?:nsenter|unshare|chroot|pivot_root|setns)\b/i, "Namespace/escape tidak diizinkan."],
  [/\b(?:mount|umount|insmod|rmmod)\b/i, "Operasi mount/kernel tidak diizinkan."],
  [/\b(?:mkfs|mkswap|fdisk|parted|wipefs|dd\s+[^;&|]*of=\/dev\/)\b/i, "Operasi disk destruktif tidak diizinkan."],
  [/\b(?:shutdown|reboot|poweroff|halt|init\s+0)\b/i, "Perintah mematikan sistem tidak diizinkan."],
  [/rm\s+-rf\s+(\/|\/\*|\/etc|\/usr|\/var)(\s|$|;)/i, "Penghapusan direktori sistem tidak diizinkan."],
  [/:\(\)\s*\{\s*:\|:\&\s*\}\s*;/, "Fork bomb tidak diizinkan."],
  [/\/dev\/tcp\//i, "Reverse shell /dev/tcp tidak diizinkan."],
  [/\bnc\s+.*-e\b/i, "Reverse shell netcat tidak diizinkan."],
  [/\bssh\s+.*-R\b/i, "Port forwarding terbalik tidak diizinkan."],
  [/(?:curl|wget)[^;&|]*\|\s*(?:sh|bash|zsh|python|perl)/i, "Eksekusi kode dari jaringan tidak diizinkan."],
  [/\b(?:crontab|at)\b|(?:\/etc\/(?:cron|systemd))|(?:~\/\.bashrc)|(?:~\/\.profile)|authorized_keys|rc\.local/i, "Persistence tidak diizinkan."],
  [/\b(?:systemctl|service)\s+(?:stop|disable|mask|start|enable)\b/i, "Perubahan layanan tidak diizinkan."],
  [/\b(?:iptables|nftables|ufw)\s+-F\b/i, "Perubahan firewall tidak diizinkan."],
  [/\b(?:setcap|chattr|lsattr)\b/i, "Perubahan capability/atribut tidak diizinkan."],
  [/\/etc\/shadow|\/root\/\.ssh|id_rsa|id_ed25519/i, "Akses material kredensial tidak diizinkan."],
  [/>+\s*\/dev\//i, "Penulisan ke device tidak diizinkan."],
];

const STATE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:^|[^<])>>?(?!\s*&)/, "Redirection output mengubah state."],
  [/\b(?:tee|mv|cp|rm|mkdir|touch|chmod|chown|ln|truncate|patch|applypatch)\b/i, "Perintah mengubah filesystem."],
  [/\b(?:python(?:3)?|perl|ruby|node)\s+-c\b[\s\S]*\b(?:open|write|unlink|rename|mkdir)\s*\(/i, "Skrip menulis/mengubah file."],
  [/(?:^|\/)(?:submit|answer|solve)(?:\s|$|\/)/i, "Perintah submit jawaban mengubah state challenge."],
  [/\bcurl\b[\s\S]*-(?:X\s+)?(?:POST|PUT|PATCH|DELETE)\b/i, "HTTP state-changing request."],
  [/\bnc\b/i, "Koneksi jaringan interaktif."],
  [/\bssh\b/i, "Koneksi SSH lanjutan."],
  [/\b(?:apt|apt-get|pip|npm|gem|yum|dnf)\s+(?:install|remove|upgrade)\b/i, "Instalasi paket mengubah state."],
];

const ANALYSIS_PATTERNS = [
  /^(?:pwd|whoami|id|uname|hostname|date)\b/i,
  /^(?:ls|find|file|stat|du|df|tree)\b/i,
  /^(?:cat|head|tail|less|more|sed|awk|grep|egrep|rg|wc|sort|uniq|cut|tr|rev|strings|xxd|hexdump|od|base64|base32)\b/i,
  /^(?:python(?:3)?|perl|ruby|node)\s+-c\b/i,
  /^(?:printf|echo)\b/i,
  /^(?:openssl|zlib-flate|jq|exiftool|binwalk)\b/i,
  /^(?:curl|wget)\b\s+-I?\b/i,
  /^(?:nmap|ping|traceroute|dig|nslookup|host)\b/i,
];

export function validateRemoteCommand(command: string, policy: RemoteCommandPolicy = {}): CommandValidation {
  const value = command.trim();
  if (!value) {
    return { ok: false, risk: "blocked", reason: "Perintah kosong.", requiresAuthorization: false };
  }
  if (value.length > 4000) {
    return {
      ok: false,
      risk: "blocked",
      reason: "Perintah remote terlalu panjang (maks 4000 karakter).",
      requiresAuthorization: false,
    };
  }
  if (/[\u0000\r\n]/.test(value)) {
    return {
      ok: false,
      risk: "blocked",
      reason: "Perintah remote tidak boleh memuat NUL atau baris baru.",
      requiresAuthorization: false,
    };
  }
  for (const [pattern, reason] of BLOCKED_PATTERNS) {
    if (pattern.test(value)) {
      return { ok: false, risk: "blocked", reason, requiresAuthorization: false };
    }
  }

  let risk: CommandValidation["risk"] = "read-only";
  for (const [pattern, reason] of STATE_PATTERNS) {
    if (pattern.test(value)) {
      risk = "state-changing";
      if (!policy.allowStateChange) {
        return { ok: false, risk, reason, requiresAuthorization: true };
      }
      break;
    }
  }
  if (risk !== "state-changing" && ANALYSIS_PATTERNS.some((pattern) => pattern.test(value))) {
    risk = "analysis";
  }

  if (/\bnmap\b/i.test(value) && process.env.CTF_REMOTE_ALLOW_NETWORK_SCAN !== "1") {
    return {
      ok: false,
      risk: "blocked",
      reason: "Network scan memerlukan CTF_REMOTE_ALLOW_NETWORK_SCAN=1 dan host yang diotorisasi.",
      requiresAuthorization: true,
    };
  }
  if (policy.authorizedHost && /\b(?:curl|wget|nc|nmap|ping)\b/i.test(value)) {
    const host = policy.authorizedHost.toLowerCase();
    if (!value.toLowerCase().includes(host)) {
      return {
        ok: false,
        risk: "blocked",
        reason: "Perintah jaringan hanya boleh menargetkan host challenge yang diotorisasi.",
        requiresAuthorization: true,
      };
    }
  }

  return {
    ok: true,
    risk,
    reason:
      risk === "state-changing"
        ? "Perintah diizinkan karena otorisasi perubahan state diberikan."
        : "Perintah termasuk operasi investigasi yang diizinkan.",
    requiresAuthorization: risk === "state-changing",
  };
}
