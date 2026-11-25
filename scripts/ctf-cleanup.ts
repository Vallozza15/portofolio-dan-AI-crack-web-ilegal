/**
 * Prunes orphan records from the CTF Intelligence database.
 *
 * A record is orphaned when its parent no longer exists, e.g. a flag whose
 * challenge, session, and file were all removed by an older build that did not
 * cascade deletes. Safe to run repeatedly.
 *
 * Usage: npm run ctf:cleanup
 */
import { readFileSync } from "node:fs";
import { mutateDatabase } from "../src/lib/ctf/store";

/**
 * Loads .env.local so the script targets the same backend as the app.
 * Values already present in the environment take precedence.
 */
function loadLocalEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local: rely on the current environment (JSON backend by default).
  }
}

interface PruneReport {
  flags: number;
  evidence: number;
  toolRuns: number;
  messages: number;
  reports: number;
  reasoningContexts: number;
  intents: number;
  hypotheses: number;
  reasoningChecks: number;
  remoteProfiles: number;
  remoteConnections: number;
  challengeStates: number;
  remoteAudit: number;
}

async function main() {
  loadLocalEnv();
  console.log(`Backend: ${process.env.CTF_DATABASE_URL ? "postgres" : "json"}`);
  const report = await mutateDatabase<PruneReport>((db) => {
    const challengeIds = new Set(db.challenges.map((item) => item.id));
    const sessionIds = new Set(db.sessions.map((item) => item.id));
    const fileIds = new Set(db.files.map((item) => item.id));

    const anyLinkResolves = (links: {
      challengeId?: string;
      sessionId?: string;
      fileId?: string;
    }) => {
      const ids = [links.challengeId, links.sessionId, links.fileId].filter(Boolean) as string[];
      if (!ids.length) return true;
      return (
        (links.challengeId ? challengeIds.has(links.challengeId) : false) ||
        (links.sessionId ? sessionIds.has(links.sessionId) : false) ||
        (links.fileId ? fileIds.has(links.fileId) : false)
      );
    };

    const counts: PruneReport = {
      flags: 0,
      evidence: 0,
      toolRuns: 0,
      messages: 0,
      reports: 0,
      reasoningContexts: 0,
      intents: 0,
      hypotheses: 0,
      reasoningChecks: 0,
      remoteProfiles: 0,
      remoteConnections: 0,
      challengeStates: 0,
      remoteAudit: 0,
    };

    const flags = db.flags.filter((item) => {
      const keep = anyLinkResolves(item);
      if (!keep) counts.flags += 1;
      return keep;
    });

    const evidence = db.evidence.filter((item) => {
      const keep = anyLinkResolves(item);
      if (!keep) counts.evidence += 1;
      return keep;
    });

    const toolRuns = db.toolRuns.filter((item) => {
      const keep = !item.fileId || fileIds.has(item.fileId);
      if (!keep) counts.toolRuns += 1;
      return keep;
    });

    const messages = db.messages.filter((item) => {
      const keep = sessionIds.has(item.sessionId);
      if (!keep) counts.messages += 1;
      return keep;
    });

    const reports = db.reports.filter((item) => {
      const keep = !item.sessionId || sessionIds.has(item.sessionId);
      if (!keep) counts.reports += 1;
      return keep;
    });

    const pruneReasoning = <T extends { sessionId: string }>(items: T[], key: keyof PruneReport) => {
      const kept = items.filter((item) => {
        const valid = sessionIds.has(item.sessionId);
        if (!valid) counts[key] += 1;
        return valid;
      });
      return kept;
    };

    const reasoningContexts = pruneReasoning(db.reasoningContexts, "reasoningContexts");
    const intents = pruneReasoning(db.intents, "intents");
    const hypotheses = pruneReasoning(db.hypotheses, "hypotheses");
    const reasoningChecks = pruneReasoning(db.reasoningChecks, "reasoningChecks");

    const pruneRemote = <T extends { sessionId: string; challengeId?: string }>(
      items: T[],
      key: keyof PruneReport,
      checkChallenge = false,
    ) => {
      const kept = items.filter((item) => {
        const valid =
          sessionIds.has(item.sessionId) &&
          (!checkChallenge || !item.challengeId || challengeIds.has(item.challengeId));
        if (!valid) counts[key] += 1;
        return valid;
      });
      return kept;
    };

    const remoteProfiles = pruneRemote(db.remoteProfiles, "remoteProfiles", true);
    const remoteConnections = pruneRemote(db.remoteConnections, "remoteConnections");
    const challengeStates = pruneRemote(db.challengeStates, "challengeStates", true);
    const remoteAudit = pruneRemote(db.remoteAudit, "remoteAudit");

    db.flags = flags;
    db.evidence = evidence;
    db.toolRuns = toolRuns;
    db.messages = messages;
    db.reports = reports;
    db.reasoningContexts = reasoningContexts;
    db.intents = intents;
    db.hypotheses = hypotheses;
    db.reasoningChecks = reasoningChecks;
    db.remoteProfiles = remoteProfiles;
    db.remoteConnections = remoteConnections;
    db.challengeStates = challengeStates;
    db.remoteAudit = remoteAudit;
    return counts;
  });

  console.log(
    `Dibersihkan: flags=${report.flags} evidence=${report.evidence} toolRuns=${report.toolRuns} messages=${report.messages} reports=${report.reports} reasoningContexts=${report.reasoningContexts} intents=${report.intents} hypotheses=${report.hypotheses} reasoningChecks=${report.reasoningChecks} remoteProfiles=${report.remoteProfiles} remoteConnections=${report.remoteConnections} challengeStates=${report.challengeStates} remoteAudit=${report.remoteAudit}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
