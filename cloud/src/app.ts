import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { buildDashboardAnalytics } from "./analytics.js";
import { createMemoryStore, parseSeedKeys } from "./store.js";
import type { ApiKeyRecord, CloudStore, RateLimitState } from "./types.js";
import { DeployEventPayload, EvaluationPayload } from "./types.js";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function rateLimitKey(orgId: string): string {
  return orgId;
}

function buildRateLimitHeaders(state: RateLimitState): Record<string, string> {
  return {
    "RateLimit-Limit": String(state.limit),
    "RateLimit-Remaining": String(Math.max(0, state.remaining)),
    "RateLimit-Reset": String(Math.ceil(state.resetAt / 1000)),
  };
}

function consumeRateLimit(
  buckets: Map<string, { count: number; resetAt: number }>,
  orgId: string,
): RateLimitState {
  const now = Date.now();
  const key = rateLimitKey(orgId);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    limit: RATE_LIMIT,
    remaining: RATE_LIMIT - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export interface CloudAppOptions {
  store?: CloudStore;
  seedKeys?: ApiKeyRecord[];
}

export function createCloudApp(options: CloudAppOptions = {}): Hono {
  const store = options.store ?? createMemoryStore(options.seedKeys ?? []);
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();

  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", service: "trailhead-cloud" }));

  app.use("/dashboard/*", serveStatic({ root: "./public" }));
  app.get("/dashboard", (c) => c.redirect("/dashboard/dashboard.html"));

  app.use("/v1/*", async (c, next) => {
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) {
      return c.json({ error: "missing Authorization bearer token" }, 401);
    }
    const keyRecord = store.getOrgForKey(token);
    if (!keyRecord) {
      return c.json({ error: "invalid API key" }, 401);
    }
    c.set("orgId", keyRecord.orgId);
    c.set("orgName", keyRecord.orgName);
    c.set("apiKey", token);

    const rate = consumeRateLimit(rateBuckets, keyRecord.orgId);
    for (const [header, value] of Object.entries(buildRateLimitHeaders(rate))) {
      c.header(header, value);
    }
    if (rate.remaining < 0) {
      return c.json({ error: "rate limit exceeded" }, 429);
    }

    await next();
  });

  app.post("/v1/evaluations", async (c) => {
    const orgId = c.get("orgId") as string;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = EvaluationPayload.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid evaluation payload", details: parsed.error.flatten() },
        400,
      );
    }

    const idempotencyKey = c.req.header("Idempotency-Key") ?? parsed.data.id;
    const result = store.ingestEvaluation(orgId, parsed.data, idempotencyKey);
    return c.json(
      {
        id: result.evaluation.id,
        created: result.created,
        receivedAt: result.evaluation.receivedAt,
      },
      result.created ? 201 : 200,
    );
  });

  app.get("/v1/evaluations", (c) => {
    const orgId = c.get("orgId") as string;
    const repoId = c.req.query("repo_id");
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
    const rows = store.listEvaluations(orgId, repoId, limit);
    return c.json({ evaluations: rows, count: rows.length });
  });

  app.get("/v1/evaluations/:id", (c) => {
    const orgId = c.get("orgId") as string;
    const row = store.getEvaluation(orgId, c.req.param("id"));
    if (!row) {
      return c.json({ error: "evaluation not found" }, 404);
    }
    return c.json({ evaluation: row });
  });

  app.get("/v1/analytics/dashboard", (c) => {
    const orgId = c.get("orgId") as string;
    const repoId = c.req.query("repo_id");
    const daysRaw = c.req.query("days");
    const days = daysRaw ? parseInt(daysRaw, 10) : 30;
    const windowDays = Number.isFinite(days) && days > 0 ? days : 30;

    const analytics = buildDashboardAnalytics(
      store.listAllEvaluations(orgId),
      store.listDeployEvents(orgId),
      { repoId: repoId || undefined, days: windowDays },
    );

    const recentEvaluations = store.listEvaluations(orgId, repoId || undefined, 50);
    return c.json({ ...analytics, recentEvaluations });
  });

  app.post("/v1/deploy-events", async (c) => {
    const orgId = c.get("orgId") as string;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = DeployEventPayload.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid deploy event payload", details: parsed.error.flatten() },
        400,
      );
    }

    store.recordDeployEvent(orgId, parsed.data);
    return c.json({ received: true }, 201);
  });

  app.get("/v1/orgs", (c) => {
    const orgId = c.get("orgId") as string;
    const orgs = store.listOrgs().filter((o: { id: string }) => o.id === orgId);
    return c.json({ orgs });
  });

  app.get("/v1/repos", (c) => {
    const orgId = c.get("orgId") as string;
    const repos = store.listRepos(orgId);
    return c.json({ repos, count: repos.length });
  });

  return app;
}

export function createDefaultCloudApp(): Hono {
  const seedKeys = parseSeedKeys(process.env.TRAILHEAD_CLOUD_API_KEYS);
  return createCloudApp({ seedKeys });
}

declare module "hono" {
  interface ContextVariableMap {
    orgId: string;
    orgName: string;
    apiKey: string;
  }
}
