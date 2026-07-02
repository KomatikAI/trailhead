/**
 * Forward-only SQL migration runner core for Trailhead Cloud.
 *
 * Applies cloud/migrations/*.sql in lexical order against a pg Pool, tracking
 * applied versions in a `schema_migrations` ledger so each file runs at most
 * once. Each file is applied inside its own transaction.
 *
 * A migration file may opt out with a `-- migrate:skip` directive in its header
 * (used by the Supabase SQL-editor reference copies 002–004, which target the
 * legacy `trailhead_evaluations` table and use service_role/RLS that do not
 * exist in plain Postgres).
 *
 * The CLI entry point lives in ../scripts/migrate.ts; server.ts imports
 * runMigrations directly for boot-time migration (TRAILHEAD_MIGRATE_ON_BOOT=1).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  alreadyApplied: string[];
}

export async function runMigrations(
  pool: Pool,
  opts: { log?: (msg: string) => void; migrationsDir?: string } = {},
): Promise<MigrationResult> {
  const log = opts.log ?? (() => undefined);
  const dir = opts.migrationsDir ?? MIGRATIONS_DIR;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query<{ version: string }>(
    `SELECT version FROM schema_migrations`,
  );
  const done = new Set(rows.map((r) => r.version));

  const result: MigrationResult = { applied: [], skipped: [], alreadyApplied: [] };

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (done.has(version)) {
      result.alreadyApplied.push(version);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    if (/^\s*--\s*migrate:skip/m.test(sql)) {
      result.skipped.push(version);
      log(`skip     ${version}`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [
        version,
      ]);
      await client.query("COMMIT");
      result.applied.push(version);
      log(`applied  ${version}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`migration ${version} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return result;
}
