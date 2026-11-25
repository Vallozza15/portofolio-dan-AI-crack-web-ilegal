import { CtfdPlatformAdapter } from "./adapters/ctfd";
import { PublicPagePlatformAdapter } from "./adapters/public-page";
import type {
  PlatformAdapter,
  PlatformDiscoveryResult,
  PlatformId,
  PlatformRequestContext,
} from "./types";

const PUBLIC_PLATFORMS = [
  {
    id: "picoctf" as const,
    name: "picoCTF",
    officialUrl: "https://play.picoctf.org",
    listingPath: "/practice",
    challengePath: /\/challenge|\/practice\//i,
    requiresUserSession: false,
    notes: ["Hanya halaman publik yang dibaca; akun tidak digunakan otomatis."],
  },
  {
    id: "overthewire" as const,
    name: "OverTheWire",
    officialUrl: "https://overthewire.org",
    listingPath: "/wargames/",
    challengePath: /\/wargames\//i,
    requiresUserSession: false,
    notes: ["Wargame diakses melalui SSH resmi setelah pengguna memberikan autorisasi."],
  },
  {
    id: "portswigger-academy" as const,
    name: "PortSwigger Web Security Academy",
    officialUrl: "https://portswigger.net",
    listingPath: "/web-security/academy",
    challengePath: /\/web-security\/academy\//i,
    requiresUserSession: false,
    notes: ["Challenge instance dibuat oleh pengguna; AI tidak membuat instance otomatis."],
  },
  {
    id: "cryptohack" as const,
    name: "CryptoHack",
    officialUrl: "https://cryptohack.org",
    listingPath: "/challenges/",
    challengePath: /\/challenges\//i,
    requiresUserSession: false,
    notes: ["Progres akun tidak diubah."],
  },
  {
    id: "cyberdefenders" as const,
    name: "CyberDefenders",
    officialUrl: "https://cyberdefenders.org",
    listingPath: "/labs/",
    challengePath: /\/labs\//i,
    requiresUserSession: false,
    notes: ["Hanya deskripsi publik yang dibaca; lab berbayar tidak diambil."],
  },
  {
    id: "root-me" as const,
    name: "Root-Me",
    officialUrl: "https://www.root-me.org",
    listingPath: "/en/Challenges/",
    challengePath: /\/Challenges\//i,
    requiresUserSession: true,
    notes: ["Sebagian besar challenge memerlukan sesi pengguna."],
  },
  {
    id: "hackthebox-academy" as const,
    name: "Hack The Box Academy",
    officialUrl: "https://academy.hackthebox.com",
    listingPath: "/",
    challengePath: /\//i,
    requiresUserSession: true,
    notes: ["Tidak ada API publik resmi yang dipakai; sesi pengguna diperlukan."],
  },
  {
    id: "tryhackme" as const,
    name: "TryHackMe",
    officialUrl: "https://tryhackme.com",
    listingPath: "/",
    challengePath: /\//i,
    requiresUserSession: true,
    notes: ["Tidak ada API publik resmi yang dipakai; sesi pengguna diperlukan."],
  },
];

const adapters: Map<PlatformId, PlatformAdapter> = new Map<PlatformId, PlatformAdapter>([
  ["ctfd", new CtfdPlatformAdapter()],
  ...PUBLIC_PLATFORMS.map(
    (config): [PlatformId, PlatformAdapter] => [config.id, new PublicPagePlatformAdapter(config)],
  ),
]);

export function listPlatformAdapters(): PlatformAdapter[] {
  return [...adapters.values()];
}

export function getPlatformAdapter(id: PlatformId): PlatformAdapter {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Platform ${id} tidak dikenali.`);
  return adapter;
}

export async function discoverPlatform(
  id: PlatformId,
  context: PlatformRequestContext,
): Promise<PlatformDiscoveryResult> {
  return getPlatformAdapter(id).discover(context);
}

export async function discoverPlatforms(
  ids: PlatformId[],
  context: PlatformRequestContext,
): Promise<PlatformDiscoveryResult[]> {
  const results: PlatformDiscoveryResult[] = [];
  for (const id of ids) {
    try {
      results.push(await discoverPlatform(id, context));
    } catch (error) {
      results.push({
        platform: id,
        platformName: id,
        officialUrl: "",
        authorization: context.authorization,
        usedOfficialApi: false,
        challenges: [],
        limitations: [error instanceof Error ? error.message : String(error)],
        retrievedAt: new Date().toISOString(),
      });
    }
  }
  return results;
}
