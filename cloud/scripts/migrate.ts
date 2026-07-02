#!/usr/bin/env node
/**
 * CLI entry for the Trailhead Cloud migration runner.
 *
 * Usage: DATABASE_URL=postgres://… tsx scripts/migrate.ts
 *        (wired as `npm run migrate`)
 *
 * The reusable core lives in ../src/migrate.ts so server.ts can run migrations
 * on boot (TRAILHEAD_MIGRATE_ON_BOOT=1) without duplicating logic.
 */
import pg from "pg";
import { runMigrations } from "../src/migrate.js";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required to run migrations");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  try {
    const result = await runMigrations(pool, { log: (m) => console.log(m) });
    console.log(
      JSON.stringify({
        level: "info",
        msg: "migrations complete",
        applied: result.applied,
        skipped: result.skipped,
        alreadyApplied: result.alreadyApplied.length,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
