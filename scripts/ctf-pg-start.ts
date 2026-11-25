/**
 * Starts the portable PostgreSQL used for local CTF Intelligence development.
 *
 * Binaries live outside the repository (default: %LOCALAPPDATA%\ctf-intelligence\tools)
 * so Next.js never traces multi-hundred-megabyte archives into a build. Create
 * them first with `scripts/ctf-pg-setup.ps1`.
 *
 * This is for local use only; production should point CTF_DATABASE_URL at a
 * managed PostgreSQL instance.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TOOLS = process.env.CTF_TOOLS_DIR || path.join(os.homedir(), "AppData", "Local", "ctf-intelligence", "tools");
const ROOT = path.join(TOOLS, "pgsql");
const BIN = path.join(ROOT, "bin");
const DATA = path.join(TOOLS, "pgdata");
const LOG = path.join(TOOLS, "pg.log");
const PORT = process.env.CTF_PG_PORT || "5433";
const USER = process.env.CTF_PG_USER || "ctf";
const PASSWORD = process.env.CTF_PG_PASSWORD || "ctf_local_password";
const DATABASE = process.env.CTF_PG_DATABASE || "ctf_intelligence";

function exe(name: string) {
  const file = path.join(BIN, `${name}.exe`);
  if (!existsSync(file)) {
    console.error(`Binary tidak ditemukan: ${file}`);
    console.error("Jalankan: powershell -ExecutionPolicy Bypass -File scripts\\ctf-pg-setup.ps1");
    process.exit(1);
  }
  return file;
}

function run(name: string, args: string[]) {
  const result = spawnSync(exe(name), args, { encoding: "utf8" });
  return { code: result.status ?? 1, out: `${result.stdout || ""}${result.stderr || ""}` };
}

mkdirSync(TOOLS, { recursive: true });

if (!existsSync(path.join(DATA, "PG_VERSION"))) {
  console.log("Menginisialisasi cluster PostgreSQL…");
  const init = spawnSync(
    exe("initdb"),
    ["-D", DATA, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"],
    { encoding: "utf8" },
  );
  if (init.status !== 0) {
    console.error(init.stdout, init.stderr);
    process.exit(1);
  }
  console.log("Cluster dibuat.");
}

const running = run("pg_ctl", ["-D", DATA, "status"]);
if (running.code === 0) {
  console.log("PostgreSQL sudah berjalan.");
} else {
  console.log(`Menjalankan PostgreSQL di port ${PORT}…`);
  // pg_ctl -w leaves the postgres child holding inherited stdio pipes. With
  // piped stdio spawnSync never returns even after the server is ready, so
  // detach the output here and rely on the log file + bootstrap query below.
  const start = spawnSync(
    exe("pg_ctl"),
    ["-D", DATA, "-l", LOG, "-o", `-p ${PORT}`, "-w", "start"],
    { encoding: "utf8", stdio: "ignore" },
  );
  if (start.status !== 0) {
    console.error(start.stdout, start.stderr);
    console.error(`Lihat log: ${LOG}`);
    process.exit(1);
  }
}

const url = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

async function bootstrap() {
  // The portable zonky build only ships initdb/pg_ctl/postgres (no psql), so
  // role and database creation goes through the pg driver instead.
  const { Client } = await import("pg");
  const admin = new Client({ connectionString: `postgres://postgres@127.0.0.1:${PORT}/postgres` });
  await admin.connect();
  try {
    const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [USER]);
    if (!role.rowCount) {
      await admin.query(`CREATE ROLE ${USER} LOGIN PASSWORD '${PASSWORD.replace(/'/g, "''")}'`);
      console.log(`Role ${USER} dibuat.`);
    }
    const db = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE]);
    if (!db.rowCount) {
      await admin.query(`CREATE DATABASE ${DATABASE} OWNER ${USER}`);
      console.log(`Database ${DATABASE} dibuat.`);
    }
  } finally {
    await admin.end();
  }
}

bootstrap()
  .then(() => {
    console.log("\nPostgreSQL siap.");
    console.log(`CTF_DATABASE_URL=${url}`);
    console.log("\nTambahkan baris di atas ke .env.local, lalu jalankan: npm run ctf:migrate");
  })
  .catch((error) => {
    console.error("Bootstrap gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
