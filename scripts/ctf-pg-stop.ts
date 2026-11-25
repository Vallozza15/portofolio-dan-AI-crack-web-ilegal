/**
 * Stops the portable PostgreSQL cluster used for local CTF Intelligence.
 * Counterpart of scripts/ctf-pg-start.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TOOLS = process.env.CTF_TOOLS_DIR || path.join(os.homedir(), "AppData", "Local", "ctf-intelligence", "tools");
const BIN = path.join(TOOLS, "pgsql", "bin");
const DATA = path.join(TOOLS, "pgdata");

const pgCtl = path.join(BIN, "pg_ctl.exe");
if (!existsSync(pgCtl)) {
  console.log("pg_ctl tidak ditemukan; PostgreSQL portable tidak terpasang.");
  process.exit(0);
}
if (!existsSync(path.join(DATA, "PG_VERSION"))) {
  console.log("Cluster PostgreSQL belum diinisialisasi.");
  process.exit(0);
}

const status = spawnSync(pgCtl, ["-D", DATA, "status"], { encoding: "utf8" });
if (status.status !== 0) {
  console.log("PostgreSQL tidak sedang berjalan.");
  process.exit(0);
}

const stop = spawnSync(pgCtl, ["-D", DATA, "-m", "fast", "-w", "stop"], { encoding: "utf8" });
console.log(`${stop.stdout || ""}${stop.stderr || ""}`.trim() || "PostgreSQL dihentikan.");
process.exit(stop.status ?? 0);
