/**
 * Migration runner: applies (or rolls back) the SQL files in ../migrations
 * against DATABASE_URL, tracking what has run in `schema_migrations`.
 *
 * Usage:
 *   bun run migrate        # apply every migration not yet recorded
 *   bun run migrate:down    # roll back the most recently applied migration
 *
 * Each file is one forward migration followed by a `-- rollback` marker and
 * the paired rollback statements (see migrations/0001_init.sql). `down`
 * reads everything after that marker and runs it in one transaction.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

async function ensureTrackingTable(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function splitRollback(sql: string): { forward: string; rollback: string } {
  const marker = "-- rollback";
  const idx = sql.indexOf(marker);
  if (idx === -1) return { forward: sql, rollback: "" };
  const forward = sql.slice(0, idx);
  const rollback = sql
    .slice(idx + marker.length)
    .split("\n")
    .map((line) => line.replace(/^--\s?/, ""))
    .join("\n");
  return { forward, rollback };
}

async function up(pool: Pool): Promise<void> {
  await ensureTrackingTable(pool);
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const { forward } = splitRollback(sql);
    console.log(`applying ${file}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(forward);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log("up to date");
}

async function down(pool: Pool): Promise<void> {
  await ensureTrackingTable(pool);
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`,
  );
  const last = rows[0]?.name;
  if (!last) {
    console.log("nothing to roll back");
    return;
  }
  const sql = readFileSync(join(migrationsDir, last), "utf8");
  const { rollback } = splitRollback(sql);
  if (!rollback.trim()) {
    throw new Error(`${last} has no "-- rollback" section — cannot roll back automatically`);
  }
  console.log(`rolling back ${last}`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(rollback);
    await client.query(`DELETE FROM schema_migrations WHERE name = $1`, [last]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const direction = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    if (direction === "up") await up(pool);
    else if (direction === "down") await down(pool);
    else throw new Error(`usage: migrate.ts <up|down>`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
