import { serve } from "@hono/node-server";
import { createCloudApp } from "./app.js";
import { startDigestCron } from "./digest-cron.js";
import { createMemoryStore, parseSeedKeys } from "./store.js";

const port = parseInt(process.env.PORT ?? "3101", 10);
const seedKeys = parseSeedKeys(process.env.TRAILHEAD_CLOUD_API_KEYS);
const store = createMemoryStore(seedKeys);
const app = createCloudApp({ seedKeys, store });

console.log(
  JSON.stringify({
    level: "info",
    msg: "Trailhead Cloud API starting",
    service: "trailhead-cloud",
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
