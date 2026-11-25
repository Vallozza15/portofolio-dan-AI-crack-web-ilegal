import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "../store";
import type { ResearchSession } from "./types";

const SESSIONS_FILE = () => path.join(getDataDir(), "research-sessions.json");
const MAX_SESSIONS = 40;

async function readAll(): Promise<ResearchSession[]> {
  try {
    const parsed = JSON.parse(await readFile(SESSIONS_FILE(), "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as ResearchSession[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(sessions: ResearchSession[]): Promise<void> {
  const file = SESSIONS_FILE();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(sessions.slice(-MAX_SESSIONS), null, 2), "utf8");
  await rename(temp, file);
}

export async function saveResearchSession(session: ResearchSession): Promise<void> {
  const bounded: ResearchSession = {
    ...session,
    queries: session.queries.slice(0, 20),
    results: session.results.slice(0, 40),
    sources: session.sources.slice(0, 40),
    candidates: session.candidates.slice(0, 10),
    events: session.events.slice(-200),
  };
  const sessions = await readAll();
  const index = sessions.findIndex((item) => item.id === bounded.id);
  if (index >= 0) sessions[index] = bounded;
  else sessions.push(bounded);
  await writeAll(sessions);
}

export async function getResearchSession(id: string): Promise<ResearchSession | null> {
  const sessions = await readAll();
  return sessions.find((item) => item.id === id) || null;
}

export async function listResearchSessions(limit = 20): Promise<ResearchSession[]> {
  const sessions = await readAll();
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, MAX_SESSIONS)))
    .map((session) => ({
      ...session,
      results: [],
      sources: [],
      events: [],
    }));
}
