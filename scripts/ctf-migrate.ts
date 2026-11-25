/**
 * Migrates the local JSON store (.data/ctf-intelligence.json) into PostgreSQL.
 *
 * Usage:
 *   set CTF_DATABASE_URL=postgres://user:pass@host:5432/dbname
 *   npm run ctf:migrate
 *
 * The migration is idempotent: rows are upserted by primary key, so running it
 * twice does not duplicate data. It never deletes rows that are missing from the
 * JSON file unless --prune is passed.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { defaultSettings } from "../src/lib/ctf/store";
import type { CtfDatabase } from "../src/lib/ctf/types";

const DATA_DIR = path.resolve(process.env.CTF_DATA_DIR || ".data");
const DB_FILE = path.join(DATA_DIR, "ctf-intelligence.json");

interface TableSpec {
  table: string;
  key: keyof CtfDatabase;
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
  { table: "ctf_audit", key: "audit", columns: ["created_at", "action"] },
];

function columnValue(record: Record<string, unknown>, column: string): unknown {
  const camel = column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const value = record[camel];
  return value === undefined ? null : value;
}

async function main() {
  const url = process.env.CTF_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("CTF_DATABASE_URL belum diatur. Contoh:");
    console.error("  postgres://ctf:secret@127.0.0.1:5432/ctf_intelligence");
    process.exit(1);
  }
  const prune = process.argv.includes("--prune");

  let db: Partial<CtfDatabase> = {};
  try {
    db = JSON.parse(await readFile(DB_FILE, "utf8")) as Partial<CtfDatabase>;
    console.log(`Sumber: ${DB_FILE}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`Tidak ada ${DB_FILE}. Membuat skema kosong saja.`);
    } else {
      throw error;
    }
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [4_133_077]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ctf_settings (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    for (const spec of TABLES) {
      const extra = spec.columns.map((column) => `, ${column} text`).join("");
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

    const settings = (db.settings || defaultSettings()) as unknown as Record<string, unknown>;
    await client.query(
      `INSERT INTO ctf_settings (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [JSON.stringify(settings)],
    );
    console.log("settings: 1 baris");

    for (const spec of TABLES) {
      const records = (db[spec.key] as unknown as Array<Record<string, unknown>>) || [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        const id = String(record.id);
        const values = spec.columns.map((column) => columnValue(record, column));
        const insertColumns = ["id", "data", "position", ...spec.columns].join(", ");
        const placeholders = ["$1", "$2", "$3", ...spec.columns.map((_, i) => `$${i + 4}`)].join(", ");
        const updateSet = ["data = $2", "position = $3", ...spec.columns.map((column, i) => `${column} = $${i + 4}`)].join(", ");
        await client.query(
          `INSERT INTO ${spec.table} (${insertColumns}) VALUES (${placeholders})
           ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
          [id, JSON.stringify(record), index, ...values],
        );
      }
      if (prune) {
        const ids = records.map((record) => String(record.id));
        if (ids.length) {
          await client.query(`DELETE FROM ${spec.table} WHERE NOT (id = ANY($1::text[]))`, [ids]);
        } else {
          await client.query(`DELETE FROM ${spec.table}`);
        }
      }
      console.log(`${spec.table}: ${records.length} baris`);
    }

    await client.query("COMMIT");
    console.log("\nMigrasi selesai. Set CTF_DATABASE_URL di .env.local dan mulai ulang server.");
    if (!prune) console.log("Baris yang tidak ada di JSON tidak dihapus. Gunakan --prune untuk menyamakan.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migrasi gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
