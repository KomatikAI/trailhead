import { serve } from "@hono/node-server";
import pg from "pg";
import { createCloudApp } from "./app.js";
import { startDigestCron } from "./digest-cron.js";
import { runMigrations } from "./migrate.js";
import { createPgStore } from "./pg-store.js";
import { createMemoryStore, parseSeedKeys } from "./store.js";
import type { CloudStore } from "./types.js";

const port = parseInt(process.env.PORT ?? "3101", 10);
const seedKeys = parseSeedKeys(process.env.TRAILHEAD_CLOUD_API_KEYS);

async function buildStore(): Promise<CloudStore> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return createMemoryStore(seedKeys);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  if (process.env.TRAILHEAD_MIGRATE_ON_BOOT === "1") {
    const result = await runMigrations(pool, { log: (m) => console.log(m) });
    console.log(
      JSON.stringify({
        level: "info",
        msg: "migrations applied on boot",
        applied: result.applied,
        skipped: result.skipped,
        ts: new Date().toISOString(),
      }),
    );
  }
  return createPgStore(pool);
}

async function main(): Promise<void> {
  const store = await buildStore();
  const app = createCloudApp({ seedKeys, store });

  console.log(
    JSON.stringify({
      level: "info",
      msg: "Trailhead Cloud API starting",
      service: "trailhead-cloud",
      store: process.env.DATABASE_URL ? "postgres" : "memory",
      port,
      ts: new Date().toISOString(),
    }),
  );

  if (process.env.TRAILHEAD_CLOUD_DIGEST_CRON === "1") {
    const orgIds = [...new Set(seedKeys.map((k) => k.orgId))];
    const intervalHours = parseInt(
      process.env.TRAILHEAD_CLOUD_DIGEST_INTERVAL_HOURS ?? "24",
      10,
    );
    startDigestCron({
      store,
      intervalHours,
      deliverForOrgIds: orgIds,
    });
  }

  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
