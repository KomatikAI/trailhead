import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Cloud API (Hono app) and its Postgres store live in the sibling
  // `cloud/` workspace package as ESM TypeScript. Next transpiles it so the
  // mounted `/api/cloud/*` handler and the billing store share one build.
  // Lane A owns cloud/ (async CloudStore + createPgStore); see site/README.md.
  transpilePackages: ["trailhead-cloud"],
  // `pg` is a native/Node-only driver — never bundle it into the Edge runtime.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
