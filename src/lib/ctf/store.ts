import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { workspaceRoot } from "./picoctf/workspace";
import { isPostgresEnabled, loadSnapshot, mutateSnapshot, saveSnapshot } from "./pg";
import type {
  AiSettings,
  AuditLog,
  Challenge,
  ChallengeStateRecord,
  CtfDatabase,
  CtfSettings,
  Evidence,
  ExecutionStepRecord,
  FlagRecord,
  HypothesisRecord,
  IntentRecord,
  Message,
  PlatformConnectionRecord,
  ReasoningCheckRecord,
  ReasoningContextRecord,
  RemoteAuditRecord,
  RemoteConnectionRecord,
  RemoteProfileRecord,
  Report,
  Session,
  StoredFile,
  SystemSettings,
  ToolRun,
  VerificationRecordEntity,
} from "./types";

const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.CTF_DATA_DIR || ".data");
const DB_FILE = path.join(DATA_DIR, "ctf-intelligence.json");
const LEGACY_UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const UPLOAD_DIR = workspaceRoot();

export function getDataDir() {
  return DATA_DIR;
}

export function getUploadDir() {
  return UPLOAD_DIR;
}

function resolveWithin(root: string, storageName: string): string {
  const base = path.resolve(root);
  const target = path.resolve(base, storageName);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error("Path file tidak valid.");
  return target;
}

/**
 * Resolve a stored attachment path without allowing traversal outside the
 * upload root. Files uploaded before CTF_WORKSPACE_ROOT are still readable from
 * the legacy .data/uploads directory; new files go to the configured workspace.
 */
export function resolveStoredFilePath(storageName: string): string {
  const current = resolveWithin(UPLOAD_DIR, storageName);
  if (existsSync(current)) return current;
  const legacy = resolveWithin(LEGACY_UPLOAD_DIR, storageName);
  if (existsSync(legacy)) return legacy;
  return current;
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function defaultSettings(): CtfSettings {
  const ai: AiSettings = {
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 4096,
      },
      {
        id: "anthropic",
        label: "Anthropic",
        enabled: false,
        baseUrl: "https://api.anthropic.com/v1",
        model: "claude-sonnet-4-20250514",
        temperature: 0.2,
        maxTokens: 4096,
      },
      {
        id: "gemini",
        label: "Google Gemini",
        enabled: false,
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.5-flash",
        temperature: 0.2,
        maxTokens: 4096,
      },
      {
        id: "ollama",
        label: "Ollama (local)",
        enabled: false,
        baseUrl: "http://127.0.0.1:11434",
        model: "llama3.2",
        temperature: 0.2,
        maxTokens: 4096,
      },
      {
        id: "compatible",
        label: "OpenAI-compatible",
        enabled: false,
        baseUrl: "",
        model: "",
        temperature: 0.2,
        maxTokens: 4096,
      },
    ],
    defaultProvider: "local",
    fallbackOrder: ["openai", "anthropic", "gemini", "ollama", "compatible", "local"],
    customInstructions: "",
  };

  const system: SystemSettings = {
    defaultLanguage: "id",
    maxUploadMb: Number(process.env.CTF_MAX_UPLOAD_MB || 25),
    allowPrivateHttp: false,
    hostToolsEnabled: process.env.CTF_HOST_TOOLS === "1",
    sandboxEnabled: process.env.CTF_SANDBOX_ENABLED === "1",
    retainDays: 90,
  };

  return { ai, system, updatedAt: nowIso() };
}

function emptyDatabase(): CtfDatabase {
  return {
    version: 1,
    challenges: [],
    files: [],
    sessions: [],
    messages: [],
    evidence: [],
    toolRuns: [],
    flags: [],
    reports: [],
    reasoningContexts: [],
    intents: [],
    hypotheses: [],
    reasoningChecks: [],
    remoteProfiles: [],
    remoteConnections: [],
    challengeStates: [],
    remoteAudit: [],
    platformConnections: [],
    executionSteps: [],
    verificationRecords: [],
    settings: defaultSettings(),
    audit: [],
  };
}

function normalizeDatabase(input: Partial<CtfDatabase>): CtfDatabase {
  const base = emptyDatabase();
  const db: CtfDatabase = {
    ...base,
    ...input,
    version: 1,
    settings: {
      ...base.settings,
      ...(input.settings || {}),
      ai: { ...base.settings.ai, ...(input.settings?.ai || {}) },
      system: { ...base.settings.system, ...(input.settings?.system || {}) },
    },
    challenges: Array.isArray(input.challenges) ? input.challenges : [],
    files: Array.isArray(input.files) ? input.files : [],
    sessions: Array.isArray(input.sessions) ? input.sessions : [],
    messages: Array.isArray(input.messages) ? input.messages : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    toolRuns: Array.isArray(input.toolRuns) ? input.toolRuns : [],
    flags: Array.isArray(input.flags) ? input.flags : [],
    reports: Array.isArray(input.reports) ? input.reports : [],
    reasoningContexts: Array.isArray(input.reasoningContexts) ? input.reasoningContexts : [],
    intents: Array.isArray(input.intents) ? input.intents : [],
    hypotheses: Array.isArray(input.hypotheses) ? input.hypotheses : [],
    reasoningChecks: Array.isArray(input.reasoningChecks) ? input.reasoningChecks : [],
    remoteProfiles: Array.isArray(input.remoteProfiles) ? input.remoteProfiles : [],
    remoteConnections: Array.isArray(input.remoteConnections) ? input.remoteConnections : [],
    challengeStates: Array.isArray(input.challengeStates) ? input.challengeStates : [],
    remoteAudit: Array.isArray(input.remoteAudit) ? input.remoteAudit : [],
    platformConnections: Array.isArray(input.platformConnections) ? input.platformConnections : [],
    executionSteps: Array.isArray(input.executionSteps) ? input.executionSteps : [],
    verificationRecords: Array.isArray(input.verificationRecords) ? input.verificationRecords : [],
    audit: Array.isArray(input.audit) ? input.audit : [],
  };
  return db;
}

function trimCollections(db: CtfDatabase) {
  if (db.audit.length > 500) db.audit = db.audit.slice(-500);
  if (db.toolRuns.length > 2000) db.toolRuns = db.toolRuns.slice(-2000);
  if (db.reasoningContexts.length > 1000) db.reasoningContexts = db.reasoningContexts.slice(-1000);
  if (db.intents.length > 1000) db.intents = db.intents.slice(-1000);
  if (db.hypotheses.length > 2000) db.hypotheses = db.hypotheses.slice(-2000);
  if (db.reasoningChecks.length > 1000) db.reasoningChecks = db.reasoningChecks.slice(-1000);
  if (db.remoteAudit.length > 1000) db.remoteAudit = db.remoteAudit.slice(-1000);
  if (db.remoteConnections.length > 500) db.remoteConnections = db.remoteConnections.slice(-500);
  if (db.challengeStates.length > 500) db.challengeStates = db.challengeStates.slice(-500);
  if (db.remoteProfiles.length > 200) db.remoteProfiles = db.remoteProfiles.slice(-200);
  if (db.platformConnections.length > 200) db.platformConnections = db.platformConnections.slice(-200);
  if (db.executionSteps.length > 5000) db.executionSteps = db.executionSteps.slice(-5000);
  if (db.verificationRecords.length > 2000) db.verificationRecords = db.verificationRecords.slice(-2000);
}

let cache: CtfDatabase | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOAD_DIR, { recursive: true });
}

async function readDatabase(): Promise<CtfDatabase> {
  await ensureDirs();
  if (isPostgresEnabled()) {
    // No in-process cache: another instance may have written since the last
    // read, so always take a fresh snapshot from PostgreSQL.
    return normalizeDatabase(await loadSnapshot());
  }
  if (cache) return cache;
  try {
    const raw = await readFile(DB_FILE, "utf8");
    cache = normalizeDatabase(JSON.parse(raw) as Partial<CtfDatabase>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    cache = emptyDatabase();
    await persist(cache);
  }
  return cache;
}

async function persist(db: CtfDatabase) {
  await ensureDirs();
  if (isPostgresEnabled()) {
    await saveSnapshot(db);
    return;
  }
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(db, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temp, DB_FILE);
}

/**
 * Serializes all mutations in this process. In PostgreSQL mode the snapshot is
 * re-read before each mutation so concurrent instances do not clobber each
 * other; the write itself runs under a PostgreSQL advisory lock.
 */
export async function mutateDatabase<T>(mutator: (db: CtfDatabase) => T | Promise<T>): Promise<T> {
  if (isPostgresEnabled()) {
    const run = writeQueue.then(() =>
      mutateSnapshot(normalizeDatabase, async (db) => {
        const result = await mutator(db);
        trimCollections(db);
        return result;
      }),
    );
    writeQueue = run.catch(() => undefined);
    return run;
  }
  const run = writeQueue.then(async () => {
    const db = await readDatabase();
    const result = await mutator(db);
    trimCollections(db);
    await persist(db);
    return result;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function readDatabaseSnapshot(): Promise<CtfDatabase> {
  return readDatabase();
}

export async function audit(action: string, detail: string, actor = "local-operator") {
  return mutateDatabase((db) => {
    const entry: AuditLog = {
      id: newId("log"),
      action,
      detail: detail.slice(0, 500),
      actor,
      createdAt: nowIso(),
    };
    db.audit.push(entry);
    return entry;
  });
}

export async function createChallenge(
  input: Omit<Challenge, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: Challenge["status"];
  },
): Promise<Challenge> {
  return mutateDatabase((db) => {
    const at = nowIso();
    const challenge: Challenge = {
      ...input,
      id: newId("ch"),
      status: input.status || "UNSOLVED",
      createdAt: at,
      updatedAt: at,
    };
    db.challenges.unshift(challenge);
    return challenge;
  });
}

export async function updateChallenge(
  id: string,
  patch: Partial<Challenge>,
): Promise<Challenge | null> {
  return mutateDatabase((db) => {
    const challenge = db.challenges.find((item) => item.id === id);
    if (!challenge) return null;
    Object.assign(challenge, patch, { id: challenge.id, updatedAt: nowIso() });
    return challenge;
  });
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const db = await readDatabase();
  return db.challenges.find((item) => item.id === id) || null;
}

export async function listChallenges(): Promise<Challenge[]> {
  const db = await readDatabase();
  return [...db.challenges];
}

export async function deleteChallenge(id: string): Promise<boolean> {
  return mutateDatabase((db) => {
    const before = db.challenges.length;
    const removedFiles = new Set(db.files.filter((file) => file.challengeId === id).map((file) => file.id));
    db.challenges = db.challenges.filter((item) => item.id !== id);
    db.files = db.files.filter((file) => file.challengeId !== id);
    db.sessions = db.sessions.map((session) =>
      session.challengeId === id ? { ...session, challengeId: undefined } : session,
    );
    db.evidence = db.evidence.filter(
      (item) => item.challengeId !== id && !removedFiles.has(item.fileId || ""),
    );
    db.flags = db.flags.filter(
      (flag) => flag.challengeId !== id && !removedFiles.has(flag.fileId || ""),
    );
    db.toolRuns = db.toolRuns.filter(
      (run) => run.challengeId !== id && !removedFiles.has(run.fileId || ""),
    );
    db.reasoningContexts = db.reasoningContexts.filter((item) => item.challengeId !== id);
    db.intents = db.intents.filter((item) => item.challengeId !== id);
    db.hypotheses = db.hypotheses.filter((item) => item.challengeId !== id);
    db.reasoningChecks = db.reasoningChecks.filter((item) => item.challengeId !== id);
    db.challengeStates = db.challengeStates.filter((item) => item.challengeId !== id);
    db.remoteProfiles = db.remoteProfiles.filter((item) => item.challengeId !== id);
    return db.challenges.length < before;
  });
}

export async function addFileRecord(file: StoredFile): Promise<StoredFile> {
  return mutateDatabase((db) => {
    db.files.unshift(file);
    return file;
  });
}

export async function getFileRecord(id: string): Promise<StoredFile | null> {
  const db = await readDatabase();
  return db.files.find((item) => item.id === id) || null;
}

export async function listFiles(challengeId?: string): Promise<StoredFile[]> {
  const db = await readDatabase();
  return db.files.filter((item) => !challengeId || item.challengeId === challengeId);
}

export async function updateFileRecord(
  id: string,
  patch: Partial<StoredFile>,
): Promise<StoredFile | null> {
  return mutateDatabase((db) => {
    const file = db.files.find((item) => item.id === id);
    if (!file) return null;
    Object.assign(file, patch, { id: file.id });
    return file;
  });
}

export async function deleteFileRecord(id: string): Promise<StoredFile | null> {
  return mutateDatabase((db) => {
    const file = db.files.find((item) => item.id === id);
    if (!file) return null;
    db.files = db.files.filter((item) => item.id !== id);
    db.evidence = db.evidence.filter((item) => item.fileId !== id);
    db.flags = db.flags.filter((flag) => flag.fileId !== id);
    db.toolRuns = db.toolRuns.filter((run) => run.fileId !== id);
    return file;
  });
}

export async function createSession(input: {
  challengeId?: string;
  title: string;
  mode: Session["mode"];
  language: Session["language"];
  provider: Session["provider"];
  model: string;
}): Promise<Session> {
  return mutateDatabase((db) => {
    const at = nowIso();
    const session: Session = {
      ...input,
      id: newId("ses"),
      status: "UNSOLVED",
      createdAt: at,
      updatedAt: at,
    };
    db.sessions.unshift(session);
    return session;
  });
}

export async function getSession(id: string): Promise<Session | null> {
  const db = await readDatabase();
  return db.sessions.find((item) => item.id === id) || null;
}

export async function listSessions(): Promise<Session[]> {
  const db = await readDatabase();
  return [...db.sessions];
}

export async function updateSession(
  id: string,
  patch: Partial<Session>,
): Promise<Session | null> {
  return mutateDatabase((db) => {
    const session = db.sessions.find((item) => item.id === id);
    if (!session) return null;
    Object.assign(session, patch, { id: session.id, updatedAt: nowIso() });
    return session;
  });
}

export async function deleteSession(id: string): Promise<boolean> {
  return mutateDatabase((db) => {
    const before = db.sessions.length;
    db.sessions = db.sessions.filter((item) => item.id !== id);
    db.messages = db.messages.filter((item) => item.sessionId !== id);
    db.evidence = db.evidence.filter((item) => item.sessionId !== id);
    db.flags = db.flags.filter((item) => item.sessionId !== id);
    db.reports = db.reports.filter((item) => item.sessionId !== id);
    db.toolRuns = db.toolRuns.filter((item) => item.sessionId !== id);
    db.reasoningContexts = db.reasoningContexts.filter((item) => item.sessionId !== id);
    db.intents = db.intents.filter((item) => item.sessionId !== id);
    db.hypotheses = db.hypotheses.filter((item) => item.sessionId !== id);
    db.reasoningChecks = db.reasoningChecks.filter((item) => item.sessionId !== id);
    db.remoteProfiles = db.remoteProfiles.filter((item) => item.sessionId !== id);
    db.remoteConnections = db.remoteConnections.filter((item) => item.sessionId !== id);
    db.challengeStates = db.challengeStates.filter((item) => item.sessionId !== id);
    db.remoteAudit = db.remoteAudit.filter((item) => item.sessionId !== id);
    return db.sessions.length < before;
  });
}

export async function addMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
  return mutateDatabase((db) => {
    const entry: Message = { ...message, id: newId("msg"), createdAt: nowIso() };
    db.messages.push(entry);
    const session = db.sessions.find((item) => item.id === message.sessionId);
    if (session) session.updatedAt = entry.createdAt;
    return entry;
  });
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  const db = await readDatabase();
  return db.messages.filter((item) => item.sessionId === sessionId);
}

export async function addEvidence(
  input: Omit<Evidence, "id" | "createdAt">,
): Promise<Evidence> {
  return mutateDatabase((db) => {
    const evidence: Evidence = { ...input, id: newId("ev"), createdAt: nowIso() };
    db.evidence.unshift(evidence);
    return evidence;
  });
}

export async function listEvidence(filters?: {
  sessionId?: string;
  challengeId?: string;
  fileId?: string;
}): Promise<Evidence[]> {
  const db = await readDatabase();
  return db.evidence.filter(
    (item) =>
      (!filters?.sessionId || item.sessionId === filters.sessionId) &&
      (!filters?.challengeId || item.challengeId === filters.challengeId) &&
      (!filters?.fileId || item.fileId === filters.fileId),
  );
}

export async function addToolRun(
  input: Omit<ToolRun, "id" | "createdAt">,
): Promise<ToolRun> {
  return mutateDatabase((db) => {
    const run: ToolRun = { ...input, id: newId("tool"), createdAt: nowIso() };
    db.toolRuns.unshift(run);
    return run;
  });
}

export async function listToolRuns(sessionId?: string): Promise<ToolRun[]> {
  const db = await readDatabase();
  return db.toolRuns.filter((item) => !sessionId || item.sessionId === sessionId);
}

export async function addFlag(
  input: Omit<FlagRecord, "id" | "createdAt">,
): Promise<FlagRecord> {
  return mutateDatabase((db) => {
    const flag: FlagRecord = { ...input, id: newId("flag"), createdAt: nowIso() };
    db.flags.unshift(flag);
    const challenge = db.challenges.find((item) => item.id === input.challengeId);
    if (challenge) {
      challenge.status = input.status;
      challenge.updatedAt = nowIso();
    }
    const session = db.sessions.find((item) => item.id === input.sessionId);
    if (session) {
      session.status = input.status;
      session.updatedAt = nowIso();
    }
    return flag;
  });
}

export async function listFlags(): Promise<FlagRecord[]> {
  const db = await readDatabase();
  return [...db.flags];
}

export async function createReport(
  input: Omit<Report, "id" | "createdAt">,
): Promise<Report> {
  return mutateDatabase((db) => {
    const report: Report = { ...input, id: newId("rep"), createdAt: nowIso() };
    db.reports.unshift(report);
    return report;
  });
}

export async function listReports(): Promise<Report[]> {
  const db = await readDatabase();
  return [...db.reports];
}

export async function getReport(id: string): Promise<Report | null> {
  const db = await readDatabase();
  return db.reports.find((item) => item.id === id) || null;
}

export async function deleteReport(id: string): Promise<boolean> {
  return mutateDatabase((db) => {
    const before = db.reports.length;
    db.reports = db.reports.filter((item) => item.id !== id);
    return db.reports.length < before;
  });
}

export async function addReasoningContext(
  input: Omit<ReasoningContextRecord, "id" | "createdAt">,
): Promise<ReasoningContextRecord> {
  return mutateDatabase((db) => {
    const record: ReasoningContextRecord = {
      ...input,
      id: newId("ctx"),
      createdAt: nowIso(),
    };
    db.reasoningContexts.push(record);
    return record;
  });
}

export async function listReasoningContexts(
  sessionId?: string,
  requestId?: string,
): Promise<ReasoningContextRecord[]> {
  const db = await readDatabase();
  return db.reasoningContexts.filter(
    (item) =>
      (!sessionId || item.sessionId === sessionId) &&
      (!requestId || item.requestId === requestId),
  );
}

export async function addIntentRecord(
  input: Omit<IntentRecord, "id" | "createdAt">,
): Promise<IntentRecord> {
  return mutateDatabase((db) => {
    const record: IntentRecord = { ...input, id: newId("intent"), createdAt: nowIso() };
    db.intents.push(record);
    return record;
  });
}

export async function listIntents(
  sessionId?: string,
  requestId?: string,
): Promise<IntentRecord[]> {
  const db = await readDatabase();
  return db.intents.filter(
    (item) =>
      (!sessionId || item.sessionId === sessionId) &&
      (!requestId || item.requestId === requestId),
  );
}

export async function addHypothesisRecord(
  input: Omit<HypothesisRecord, "id" | "createdAt" | "updatedAt">,
): Promise<HypothesisRecord> {
  return mutateDatabase((db) => {
    const at = nowIso();
    const record: HypothesisRecord = { ...input, id: newId("hyp"), createdAt: at, updatedAt: at };
    db.hypotheses.push(record);
    return record;
  });
}

export async function listHypotheses(
  sessionId?: string,
  requestId?: string,
): Promise<HypothesisRecord[]> {
  const db = await readDatabase();
  return db.hypotheses.filter(
    (item) =>
      (!sessionId || item.sessionId === sessionId) &&
      (!requestId || item.requestId === requestId),
  );
}

export async function updateHypothesisRecord(
  id: string,
  patch: Partial<HypothesisRecord>,
): Promise<HypothesisRecord | null> {
  return mutateDatabase((db) => {
    const record = db.hypotheses.find((item) => item.id === id);
    if (!record) return null;
    Object.assign(record, patch, { id: record.id, updatedAt: nowIso() });
    return record;
  });
}

export async function addReasoningCheck(
  input: Omit<ReasoningCheckRecord, "id" | "createdAt">,
): Promise<ReasoningCheckRecord> {
  return mutateDatabase((db) => {
    const record: ReasoningCheckRecord = { ...input, id: newId("check"), createdAt: nowIso() };
    db.reasoningChecks.push(record);
    return record;
  });
}

export async function listReasoningChecks(
  sessionId?: string,
  requestId?: string,
): Promise<ReasoningCheckRecord[]> {
  const db = await readDatabase();
  return db.reasoningChecks.filter(
    (item) =>
      (!sessionId || item.sessionId === sessionId) &&
      (!requestId || item.requestId === requestId),
  );
}

function latestByUpdatedAt<T extends { updatedAt: string }>(items: T[]): T | null {
  return items.reduce<T | null>(
    (latest, item) => (!latest || item.updatedAt >= latest.updatedAt ? item : latest),
    null,
  );
}

export async function listRemoteProfiles(sessionId?: string): Promise<RemoteProfileRecord[]> {
  const db = await readDatabase();
  return db.remoteProfiles.filter((item) => !sessionId || item.sessionId === sessionId);
}

export async function getRemoteProfile(id: string): Promise<RemoteProfileRecord | null> {
  const db = await readDatabase();
  return db.remoteProfiles.find((item) => item.id === id) || null;
}

export async function findRemoteProfileByName(
  sessionId: string,
  name: string,
): Promise<RemoteProfileRecord | null> {
  const db = await readDatabase();
  return db.remoteProfiles.find((item) => item.sessionId === sessionId && item.name === name) || null;
}

export async function addRemoteProfile(
  input: Omit<RemoteProfileRecord, "id" | "createdAt" | "updatedAt">,
): Promise<RemoteProfileRecord> {
  return mutateDatabase((db) => {
    const at = nowIso();
    const profile: RemoteProfileRecord = {
      ...input,
      id: newId("rprof"),
      createdAt: at,
      updatedAt: at,
    };
    db.remoteProfiles.push(profile);
    return profile;
  });
}

export async function updateRemoteProfile(
  id: string,
  patch: Partial<RemoteProfileRecord>,
): Promise<RemoteProfileRecord | null> {
  return mutateDatabase((db) => {
    const profile = db.remoteProfiles.find((item) => item.id === id);
    if (!profile) return null;
    Object.assign(profile, patch, { id: profile.id, updatedAt: nowIso() });
    return profile;
  });
}

export async function deleteRemoteProfile(id: string): Promise<boolean> {
  return mutateDatabase((db) => {
    const before = db.remoteProfiles.length;
    db.remoteProfiles = db.remoteProfiles.filter((item) => item.id !== id);
    return db.remoteProfiles.length < before;
  });
}

export async function listRemoteConnections(sessionId?: string): Promise<RemoteConnectionRecord[]> {
  const db = await readDatabase();
  return db.remoteConnections.filter((item) => !sessionId || item.sessionId === sessionId);
}

export async function getRemoteConnection(
  sessionId: string,
): Promise<RemoteConnectionRecord | null> {
  const db = await readDatabase();
  return db.remoteConnections.find((item) => item.sessionId === sessionId) || null;
}

export async function upsertRemoteConnection(
  input: Omit<RemoteConnectionRecord, "id">,
): Promise<RemoteConnectionRecord> {
  return mutateDatabase((db) => {
    const at = nowIso();
    const existing = db.remoteConnections.find((item) => item.sessionId === input.sessionId);
    if (existing) {
      Object.assign(existing, input, {
        id: existing.id,
        createdAt: existing.createdAt || at,
        updatedAt: at,
      });
      return existing;
    }
    const connection: RemoteConnectionRecord = {
      ...input,
      id: newId("rcon"),
      createdAt: input.createdAt || at,
      updatedAt: at,
    };
    db.remoteConnections.push(connection);
    return connection;
  });
}

export async function deleteRemoteConnections(sessionId: string): Promise<void> {
  await mutateDatabase((db) => {
    db.remoteConnections = db.remoteConnections.filter((item) => item.sessionId !== sessionId);
  });
}

export async function getChallengeState(
  sessionId: string,
  challengeId?: string,
): Promise<ChallengeStateRecord | null> {
  const db = await readDatabase();
  const rows = db.challengeStates.filter((item) => item.sessionId === sessionId);
  const matching = challengeId ? rows.filter((item) => item.challengeId === challengeId) : [];
  return latestByUpdatedAt(matching.length ? matching : rows);
}

export async function ensureChallengeState(
  sessionId: string,
  challengeId?: string,
): Promise<ChallengeStateRecord> {
  return mutateDatabase((db) => {
    const rows = db.challengeStates.filter((item) => item.sessionId === sessionId);
    const matching = challengeId ? rows.filter((item) => item.challengeId === challengeId) : [];
    const existing = latestByUpdatedAt(matching.length ? matching : rows);
    if (existing) return existing;

    const at = nowIso();
    const state: ChallengeStateRecord = {
      id: newId("cstate"),
      sessionId,
      challengeId,
      stage: 1,
      originalInstructions: [],
      hints: [],
      decodedMessages: [],
      commands: [],
      failures: [],
      successes: [],
      currentStageIndicator: "",
      confirmedFindings: [],
      unresolvedTasks: [],
      finalStatus: "UNSOLVED",
      createdAt: at,
      updatedAt: at,
    };
    db.challengeStates.push(state);
    return state;
  });
}

export async function updateChallengeState(
  id: string,
  patch: Partial<ChallengeStateRecord>,
): Promise<ChallengeStateRecord | null> {
  return mutateDatabase((db) => {
    const state = db.challengeStates.find((item) => item.id === id);
    if (!state) return null;
    Object.assign(state, patch, { id: state.id, updatedAt: nowIso() });
    return state;
  });
}

export async function addRemoteAudit(
  input: Omit<RemoteAuditRecord, "id" | "createdAt">,
): Promise<RemoteAuditRecord> {
  return mutateDatabase((db) => {
    const entry: RemoteAuditRecord = { ...input, id: newId("raudit"), createdAt: nowIso() };
    db.remoteAudit.push(entry);
    return entry;
  });
}

export async function listRemoteAudit(sessionId?: string): Promise<RemoteAuditRecord[]> {
  const db = await readDatabase();
  return db.remoteAudit.filter((item) => !sessionId || item.sessionId === sessionId);
}

export async function getSettings(): Promise<CtfSettings> {
  const db = await readDatabase();
  return db.settings;
}

export async function updateSettings(
  patch: Partial<CtfSettings>,
): Promise<CtfSettings> {
  return mutateDatabase((db) => {
    db.settings = {
      ...db.settings,
      ...patch,
      ai: { ...db.settings.ai, ...(patch.ai || {}) },
      system: { ...db.settings.system, ...(patch.system || {}) },
      updatedAt: nowIso(),
    };
    return db.settings;
  });
}

export async function clearOperationalData(): Promise<void> {
  await mutateDatabase((db) => {
    db.challenges = [];
    db.files = [];
    db.sessions = [];
    db.messages = [];
    db.evidence = [];
    db.toolRuns = [];
    db.flags = [];
    db.reports = [];
    db.reasoningContexts = [];
    db.intents = [];
    db.hypotheses = [];
    db.reasoningChecks = [];
    db.remoteProfiles = [];
    db.remoteConnections = [];
    db.challengeStates = [];
    db.remoteAudit = [];
    db.platformConnections = [];
    db.executionSteps = [];
    db.verificationRecords = [];
  });
}

export async function savePlatformConnection(
  input: Omit<PlatformConnectionRecord, "id" | "connectedAt">,
): Promise<PlatformConnectionRecord> {
  return mutateDatabase((db) => {
    const existing = db.platformConnections.find(
      (item) => item.platform === input.platform && item.sessionId === input.sessionId,
    );
    if (existing) {
      Object.assign(existing, input, {
        id: existing.id,
        connectedAt: existing.connectedAt,
        lastDiscoveryAt: nowIso(),
      });
      return existing;
    }
    const record: PlatformConnectionRecord = {
      ...input,
      id: newId("platform"),
      connectedAt: nowIso(),
      lastDiscoveryAt: nowIso(),
    };
    db.platformConnections.unshift(record);
    return record;
  });
}

export async function listPlatformConnections(sessionId?: string): Promise<PlatformConnectionRecord[]> {
  const db = await readDatabase();
  return sessionId
    ? db.platformConnections.filter((item) => item.sessionId === sessionId)
    : [...db.platformConnections];
}

export async function saveExecutionStep(
  input: Omit<ExecutionStepRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<ExecutionStepRecord> {
  return mutateDatabase((db) => {
    const at = nowIso();
    const existing = input.id ? db.executionSteps.find((item) => item.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input, { id: existing.id, createdAt: existing.createdAt, updatedAt: at });
      return existing;
    }
    const record: ExecutionStepRecord = {
      ...input,
      id: input.id || newId("step"),
      createdAt: at,
      updatedAt: at,
    };
    db.executionSteps.push(record);
    return record;
  });
}

export async function listExecutionSteps(sessionId?: string): Promise<ExecutionStepRecord[]> {
  const db = await readDatabase();
  return sessionId ? db.executionSteps.filter((item) => item.sessionId === sessionId) : [...db.executionSteps];
}

export async function saveVerificationRecord(
  input: Omit<VerificationRecordEntity, "id" | "createdAt">,
): Promise<VerificationRecordEntity> {
  return mutateDatabase((db) => {
    const record: VerificationRecordEntity = { ...input, id: newId("verify"), createdAt: nowIso() };
    db.verificationRecords.unshift(record);
    return record;
  });
}

export async function listVerificationRecords(sessionId?: string): Promise<VerificationRecordEntity[]> {
  const db = await readDatabase();
  return sessionId
    ? db.verificationRecords.filter((item) => item.sessionId === sessionId)
    : [...db.verificationRecords];
}

export async function getStorageStats() {
  const db = await readDatabase();
  return {
    files: db.files.length,
    bytes: db.files.reduce((sum, file) => sum + file.size, 0),
    dataDir: DATA_DIR,
    backend: isPostgresEnabled() ? "postgres" : "json",
  };
}
