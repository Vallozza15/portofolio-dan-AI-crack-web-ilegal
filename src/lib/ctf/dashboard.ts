import { getProviderStatuses } from "./ai";
import {
  getStorageStats,
  listChallenges,
  listFiles,
  listFlags,
  listMessages,
  listSessions,
  readDatabaseSnapshot,
} from "./store";
import { getToolStatuses } from "./tools";
import type { CtfCategory, DashboardData } from "./types";

export async function getDashboardData(): Promise<DashboardData> {
  const db = await readDatabaseSnapshot();
  const [providerStatus, toolStatus, storage] = await Promise.all([
    getProviderStatuses(),
    getToolStatuses(),
    getStorageStats(),
  ]);
  const categories: Array<{ category: CtfCategory; count: number }> = (
    ["cryptography", "forensics", "steganography", "web", "reverse", "binary", "osint", "misc"] as CtfCategory[]
  ).map((category) => ({
    category,
    count: db.challenges.filter((challenge) => challenge.category === category).length,
  }));
  const recentChallenges = [...db.challenges].slice(0, 5);
  const recentSessions = await Promise.all(
    [...db.sessions].slice(0, 5).map(async (session) => ({
      ...session,
      challengeTitle: db.challenges.find((challenge) => challenge.id === session.challengeId)?.title,
      messageCount: (await listMessages(session.id)).length,
    })),
  );
  const tones: Array<"green" | "cyan" | "amber" | "rose" | "violet"> = ["green", "cyan", "amber", "rose", "violet"];
  const recentActivity = [...db.audit]
    .slice(-8)
    .reverse()
    .map((entry, index) => ({
      id: entry.id,
      label: entry.action,
      detail: entry.detail,
      at: entry.createdAt,
      tone: tones[index % tones.length],
    }));
  return {
    totals: {
      challenges: db.challenges.length,
      solved: db.challenges.filter((challenge) => challenge.status === "VERIFIED").length,
      sessions: db.sessions.length,
      files: db.files.length,
      evidence: db.evidence.length,
      flags: db.flags.length,
    },
    categories,
    recentChallenges,
    recentSessions,
    recentFlags: [...db.flags].slice(0, 5),
    recentActivity,
    providerStatus,
    toolStatus,
    storage: {
      dataDir: storage.dataDir,
      uploads: storage.files,
      bytes: storage.bytes,
    },
    system: {
      authEnabled: Boolean(process.env.CTF_ACCESS_PASSWORD),
      sandboxEnabled: db.settings.system.sandboxEnabled,
      hostToolsEnabled: db.settings.system.hostToolsEnabled,
      runtime: `Node ${process.version}`,
      version: "1.0.0",
    },
  };
}

export async function getQuickCounts() {
  const [challenges, files, flags, sessions] = await Promise.all([
    listChallenges(),
    listFiles(),
    listFlags(),
    listSessions(),
  ]);
  return { challenges: challenges.length, files: files.length, flags: flags.length, sessions: sessions.length };
}
