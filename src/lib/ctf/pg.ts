import { Pool, type PoolClient } from "pg";
import type {
  AuditLog,
  Challenge,
  ChallengeStateRecord,
  CtfDatabase,
  CtfSettings,
  Evidence,
  FlagRecord,
  Message,
  RemoteAuditRecord,
  RemoteConnectionRecord,
  RemoteProfileRecord,
  Report,
  Session,
  StoredFile,
  ToolRun,
} from "./types";

const ADVISORY_LOCK_KEY = 4_133_077;

/**
 * PostgreSQL jsonb rejects lone UTF-16 surrogates and NUL/control bytes with
 * "unsupported Unicode escape sequence". Aggressive decoders can emit both, so
 * normalize them before the value reaches the driver.
 */
function sanitizeString(value: string): string {
  return value
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "string" ? sanitizeString(item) : item,
  );
}

type EntityTable =
  | "ctf_challenges"
  | "ctf_files"
  | "ctf_sessions"
  | "ctf_messages"
  | "ctf_evidence"
  | "ctf_tool_runs"
  | "ctf_flags"
  | "ctf_reports"
  | "ctf_reasoning_contexts"
  | "ctf_intents"
  | "ctf_hypotheses"
  | "ctf_reasoning_checks"
  | "ctf_remote_profiles"
  | "ctf_remote_connections"
  | "ctf_challenge_states"
  | "ctf_remote_audit"
  | "ctf_platform_connections"
  | "ctf_execution_steps"
  | "ctf_verification_records"
  | "ctf_audit";

type CollectionKey = {
  [K in keyof CtfDatabase]: CtfDatabase[K] extends readonly unknown[] ? K : never;
}[keyof CtfDatabase];

interface TableSpec {
  table: EntityTable;
  key: CollectionKey;
  columns: string[];
}

const TABLES: TableSpec[] = [
  { table: "ctf_challenges", key: "challenges", columns: ["created_at", "updated_at", "category", "status"] },
  { table: "ctf_files", key: "files", columns: ["created_at", "challenge_id"] },
  { table: "ctf_sessions", key: "sessions", columns: ["created_at", "updated_at", "challenge_id", "status"] },
  { table: "ctf_messages", key: "messages", columns: ["created_at", "session_id", "role"] },
  { table: "ctf_evidence", key: "evidence", columns: ["created_at", "session_id", "challenge_id", "file_id"] },
  { table: "ctf_tool_runs", key: "toolRuns", columns: ["created_at", "session_id", "file_id", "status"] },
  { table: "ctf_flags", key: "flags", columns: ["created_at", "challenge_id", "session_id", "file_id", "status"] },
  { table: "ctf_reports", key: "reports", columns: ["created_at", "challenge_id", "session_id", "category"] },
  {
    table: "ctf_reasoning_contexts",
    key: "reasoningContexts",
    columns: ["created_at", "session_id", "challenge_id", "request_id", "intent"],
  },
  {
    table: "ctf_intents",
    key: "intents",
    columns: ["created_at", "session_id", "challenge_id", "request_id", "intent"],
  },
  {
    table: "ctf_hypotheses",
    key: "hypotheses",
    columns: ["created_at", "updated_at", "session_id", "challenge_id", "request_id", "status"],
  },
  {
    table: "ctf_reasoning_checks",
    key: "reasoningChecks",
    columns: ["created_at", "session_id", "challenge_id", "request_id", "intent", "confidence"],
  },
  {
    table: "ctf_remote_profiles",
    key: "remoteProfiles",
    columns: ["created_at", "updated_at", "session_id", "challenge_id", "status", "host"],
  },
  {
    table: "ctf_remote_connections",
    key: "remoteConnections",
    columns: ["created_at", "updated_at", "last_seen_at", "session_id", "profile_id", "status"],
  },
  {
    table: "ctf_challenge_states",
    key: "challengeStates",
    columns: ["created_at", "updated_at", "session_id", "challenge_id", "stage", "final_status"],
  },
  {
    table: "ctf_remote_audit",
    key: "remoteAudit",
    columns: ["created_at", "session_id", "profile_id", "action"],
  },
  {
    table: "ctf_platform_connections",
    key: "platformConnections",
    columns: ["created_at", "session_id", "platform", "official_url"],
  },
  {
    table: "ctf_execution_steps",
    key: "executionSteps",
    columns: ["created_at", "updated_at", "session_id", "challenge_id", "status"],
  },
  {
    table: "ctf_verification_records",
    key: "verificationRecords",
    columns: ["created_at", "session_id", "challenge_id", "classification"],
  },
  { table: "ctf_audit", key: "audit", columns: ["created_at", "action"] },
];

export function databaseUrl(): string | null {
  const url = process.env.CTF_DATABASE_URL || process.env.DATABASE_URL || "";
  return url.trim() ? url.trim() : null;
}

export function isPostgresEnabled(): boolean {
  return databaseUrl() !== null;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = databaseUrl();
    if (!connectionString) throw new Error("CTF_DATABASE_URL belum diatur.");
    pool = new Pool({
      connectionString,
      max: Number(process.env.CTF_PG_POOL_SIZE || 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "ctf-intelligence",
    });
    pool.on("error", (error) => {
      console.error("[ctf:pg] idle client error:", error.message);
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = getPool();
    await client.query(`
      CREATE TABLE IF NOT EXISTS ctf_settings (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    for (const spec of TABLES) {
      const extra = spec.columns
        .map((column) => {
          const type =
            column.endsWith("_at") ? "timestamptz" :
            column === "status" || column === "category" || column === "role" || column === "action" ? "text" :
            "text";
          return `, ${column} ${type}`;
        })
        .join("");
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${spec.table} (
          id text PRIMARY KEY,
          data jsonb NOT NULL,
          position bigint NOT NULL DEFAULT 0${extra}
        );
      `);
      for (const column of spec.columns) {
        await client.query(
          `CREATE INDEX IF NOT EXISTS ${spec.table}_${column}_idx ON ${spec.table} (${column});`,
        );
      }
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${spec.table}_position_idx ON ${spec.table} (position);`,
      );
    }
    await client.query(`
      INSERT INTO ctf_settings (id, data)
      VALUES (1, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function columnValue(record: Record<string, unknown>, column: string): unknown {
  const camel = column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const value = record[camel];
  return value === undefined ? null : value;
}

async function loadSettings(client: PoolClient): Promise<CtfSettings | null> {
  const result = await client.query<{ data: CtfSettings }>("SELECT data FROM ctf_settings WHERE id = 1");
  const data = result.rows[0]?.data;
  if (!data || !Object.keys(data).length) return null;
  return data;
}

async function loadSnapshotIn(client: PoolClient): Promise<Partial<CtfDatabase>> {
  const settings = await loadSettings(client);
  const snapshot: Partial<CtfDatabase> = {};
  if (settings) snapshot.settings = settings;
  for (const spec of TABLES) {
    const result = await client.query<{ data: unknown }>(
      `SELECT data FROM ${spec.table} ORDER BY position ASC, id ASC`,
    );
    (snapshot as Record<string, unknown>)[spec.key] = result.rows.map((row) => row.data);
  }
  return snapshot;
}

async function saveSnapshotIn(client: PoolClient, db: CtfDatabase): Promise<void> {
  await client.query(
    `INSERT INTO ctf_settings (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
    [safeStringify(db.settings)],
  );
  for (const spec of TABLES) {
    const records = db[spec.key] as unknown as Array<Record<string, unknown>>;
    await syncTable(client, spec, records);
  }
}

/**
 * Runs a read-modify-write cycle inside a single transaction holding a
 * PostgreSQL advisory lock, so multiple app instances cannot interleave and
 * overwrite each other's changes.
 */
export async function mutateSnapshot<T>(
  normalize: (input: Partial<CtfDatabase>) => CtfDatabase,
  mutator: (db: CtfDatabase) => T | Promise<T>,
): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    const db = normalize(await loadSnapshotIn(client));
    const result = await mutator(db);
    await saveSnapshotIn(client, db);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function loadSnapshot(): Promise<Partial<CtfDatabase>> {
  await ensureSchema();
  return loadSnapshotIn(getPool() as unknown as PoolClient);
}

function sameJson(a: unknown, b: unknown): boolean {
  return safeStringify(a) === safeStringify(b);
}

async function syncTable(
  client: PoolClient,
  spec: TableSpec,
  next: Array<Record<string, unknown>>,
): Promise<void> {
  const existing = await client.query<{ id: string; data: unknown; position: string }>(
    `SELECT id, data, position FROM ${spec.table}`,
  );
  const current = new Map(existing.rows.map((row) => [row.id, row]));
  const nextIds = new Set(next.map((record) => String(record.id)));

  for (const [id] of current) {
    if (!nextIds.has(id)) {
      await client.query(`DELETE FROM ${spec.table} WHERE id = $1`, [id]);
    }
  }

  for (let index = 0; index < next.length; index += 1) {
    const record = next[index];
    const id = String(record.id);
    const position = index;
    const previous = current.get(id);
    if (previous && sameJson(previous.data, record) && Number(previous.position) === position) continue;

    const columns = spec.columns;
    const values = columns.map((column) => columnValue(record, column));
    const assignments = columns.map((column, i) => `${column} = $${i + 4}`).join(", ");
    const insertColumns = ["id", "data", "position", ...columns].join(", ");
    const placeholders = ["$1", "$2", "$3", ...columns.map((_, i) => `$${i + 4}`)].join(", ");
    const updateSet = ["data = $2", "position = $3", assignments].filter(Boolean).join(", ");
    await client.query(
      `INSERT INTO ${spec.table} (${insertColumns}) VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
      [id, safeStringify(record), position, ...values],
    );
  }
}

export async function saveSnapshot(db: CtfDatabase): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    await client.query(
      `INSERT INTO ctf_settings (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [safeStringify(db.settings)],
    );
    for (const spec of TABLES) {
      const records = db[spec.key] as unknown as Array<Record<string, unknown>>;
      await syncTable(client, spec, records);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface PgStatus {
  configured: boolean;
  reachable: boolean;
  serverVersion?: string;
  error?: string;
  tables?: number;
}

export async function getPostgresStatus(): Promise<PgStatus> {
  if (!isPostgresEnabled()) return { configured: false, reachable: false };
  try {
    await ensureSchema();
    const result = await getPool().query<{ version: string }>("SELECT version() AS version");
    const tables = await getPool().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ctf_%'",
    );
    return {
      configured: true,
      reachable: true,
      serverVersion: result.rows[0]?.version,
      tables: Number(tables.rows[0]?.count || 0),
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = null;
  }
}

export type {
  Challenge,
  ChallengeStateRecord,
  StoredFile,
  Session,
  Message,
  Evidence,
  ToolRun,
  FlagRecord,
  Report,
  AuditLog,
  RemoteAuditRecord,
  RemoteConnectionRecord,
  RemoteProfileRecord,
};
