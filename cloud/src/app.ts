import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { buildDashboardAnalytics } from "./analytics.js";
import { quotaHeaders } from "./billing.js";
import {
  aggregateDetectorNoise,
  buildDigestPayload,
  generateTuningYaml,
  recommendPolicyTuning,
} from "./feedback-core.js";
import { createMemoryStore, parseSeedKeys } from "./store.js";
import type { ApiKeyRecord, CloudStore, RateLimitState } from "./types.js";
import {
  DeployEventPayload,
  DigestSubscribePayload,
  EvaluationPayload,
  FeedbackPayload,
  OrgSettingsPatch,
} from "./types.js";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

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
  const key = orgId;
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

function applyQuotaHeaders(
  c: { header: (k: string, v: string) => void },
  store: CloudStore,
  orgId: string,
): void {
  const quota = store.getQuota(orgId);
  for (const [header, value] of Object.entries(quotaHeaders(quota.plan, quota.used))) {
    c.header(header, value);
  }
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

    applyQuotaHeaders(c, store, keyRecord.orgId);
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

    if (result.quotaExceeded) {
      const quota = store.getQuota(orgId);
      return c.json(
        {
          error: "evaluation quota exceeded or plan does not include cloud store",
          plan: quota.plan,
          limit: quota.limit,
          used: quota.used,
        },
        403,
      );
    }

    applyQuotaHeaders(c, store, orgId);
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
    const prNumberRaw = c.req.query("pr_number");
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
    const prNumber =
      prNumberRaw && Number.isFinite(parseInt(prNumberRaw, 10))
        ? parseInt(prNumberRaw, 10)
        : undefined;
    const rows = store.listEvaluations(orgId, repoId, limit, prNumber);
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

    const feedbackRows = store.listFeedback(orgId, repoId || undefined);
    const noise = aggregateDetectorNoise(feedbackRows, { repo: repoId || undefined });
    const tuning = recommendPolicyTuning(feedbackRows, { repo: repoId || undefined });

    const recentEvaluations = store.listEvaluations(orgId, repoId || undefined, 50);
    return c.json({
      ...analytics,
      recentEvaluations,
      agentLoopEfficiency: analytics.agentLoopEfficiency,
      detectorNoise: noise,
      tuningProposal: {
        ...tuning,
        yamlSnippet: generateTuningYaml(tuning.recommendations, repoId || undefined),
      },
    });
  });

  app.get("/v1/analytics/agent-loop-efficiency", (c) => {
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
    return c.json({ agentLoopEfficiency: analytics.agentLoopEfficiency });
  });

  app.post("/v1/feedback", async (c) => {
    const orgId = c.get("orgId") as string;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = FeedbackPayload.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid feedback payload", details: parsed.error.flatten() },
        400,
      );
    }

    const stored = store.recordFeedback({
      id: `fb_${crypto.randomUUID()}`,
      orgId,
      detector: parsed.data.detector,
      repo: parsed.data.repo,
      disposition: parsed.data.disposition,
      reason: parsed.data.reason,
      evaluationId: parsed.data.evaluationId,
      timestamp: new Date().toISOString(),
    });

    return c.json({ stored: true, feedback: stored }, 201);
  });

  app.get("/v1/feedback/noise", (c) => {
    const orgId = c.get("orgId") as string;
    const repoId = c.req.query("repo_id") || undefined;
    const thresholdRaw = c.req.query("fp_threshold");
    const fpThreshold = thresholdRaw ? parseInt(thresholdRaw, 10) : 15;
    const records = store.listFeedback(orgId, repoId);
    return c.json(aggregateDetectorNoise(records, { repo: repoId, fpThreshold }));
  });

  app.get("/v1/feedback/tuning", (c) => {
    const orgId = c.get("orgId") as string;
    const repoId = c.req.query("repo_id") || undefined;
    const thresholdRaw = c.req.query("fp_threshold");
    const falsePositiveThreshold = thresholdRaw ? parseInt(thresholdRaw, 10) : 15;
    const records = store.listFeedback(orgId, repoId);
    const tuning = recommendPolicyTuning(records, {
      repo: repoId,
      falsePositiveThreshold,
    });
    return c.json({
      ...tuning,
      yamlSnippet: generateTuningYaml(tuning.recommendations, repoId),
    });
  });

  app.put("/v1/digest/subscribe", async (c) => {
    const orgId = c.get("orgId") as string;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    const parsed = DigestSubscribePayload.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid digest payload", details: parsed.error.flatten() },
        400,
      );
    }
    const settings = store.updateOrgSettings(orgId, {
      digest: {
        enabled: parsed.data.enabled,
        channel: parsed.data.channel,
        destination: parsed.data.destination,
        fpThreshold: parsed.data.fpThreshold,
      },
    });
    return c.json({ digest: settings.digest });
  });

  app.get("/v1/digest/preview", (c) => {
    const orgId = c.get("orgId") as string;
    const orgName = c.get("orgName") as string;
    const settings = store.getOrgSettings(orgId);
    const fpThreshold = settings.digest?.fpThreshold ?? 15;
    const noise = aggregateDetectorNoise(store.listFeedback(orgId), { fpThreshold });
    const digest = buildDigestPayload(noise, orgName);
    return c.json({
      enabled: settings.digest?.enabled ?? false,
      channel: settings.digest?.channel ?? null,
      destination: settings.digest?.destination ?? null,
      ...digest,
    });
  });

  app.get("/v1/org/settings", (c) => {
    const orgId = c.get("orgId") as string;
    const settings = store.getOrgSettings(orgId);
    const quota = store.getQuota(orgId);
    return c.json({ settings, quota, plans: ["free", "pro", "team"] });
  });

  app.put("/v1/org/settings", async (c) => {
    const orgId = c.get("orgId") as string;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    const parsed = OrgSettingsPatch.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid settings", details: parsed.error.flatten() }, 400);
    }
    const current = store.getOrgSettings(orgId);
    if (parsed.data.sso?.enabled && current.plan !== "team") {
      return c.json({ error: "SSO requires Team plan" }, 403);
    }
    const settings = store.updateOrgSettings(orgId, parsed.data);
    return c.json({ settings, quota: store.getQuota(orgId) });
  });

  app.get("/v1/api-keys", (c) => {
    const orgId = c.get("orgId") as string;
    const keys = store.listManagedKeys(orgId).map(({ key: _key, ...rest }) => rest);
    return c.json({ keys, count: keys.length });
  });

  app.post("/v1/api-keys", async (c) => {
    const orgId = c.get("orgId") as string;
    let label: string | undefined;
    try {
      const body = await c.req.json();
      label = typeof body?.label === "string" ? body.label : undefined;
    } catch {
      label = undefined;
    }
    try {
      const created = store.createApiKey(orgId, label);
      return c.json(
        {
          key: {
            id: created.key.id,
            label: created.key.label,
            keyPreview: created.key.keyPreview,
            createdAt: created.key.createdAt,
          },
          secret: created.secret,
        },
        201,
      );
    } catch (error) {
      return c.json({ error: String(error) }, 403);
    }
  });

  app.delete("/v1/api-keys/:id", (c) => {
    const orgId = c.get("orgId") as string;
    const revoked = store.revokeApiKey(orgId, c.req.param("id"));
    if (!revoked) {
      return c.json({ error: "key not found" }, 404);
    }
    return c.json({ revoked: true });
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
    const settings = store.getOrgSettings(orgId);
    return c.json({ orgs, plan: settings.plan });
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
