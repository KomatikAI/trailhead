import { serve } from "@hono/node-server";
import { createDefaultCloudApp } from "./app.js";

const port = parseInt(process.env.PORT ?? "3101", 10);
const app = createDefaultCloudApp();

console.log(
  JSON.stringify({
    level: "info",
    msg: "Trailhead Cloud API starting",
    service: "trailhead-cloud",
    port,
    ts: new Date().toISOString(),
  }),
);

serve({ fetch: app.fetch, port });
