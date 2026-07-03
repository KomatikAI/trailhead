import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { buildDashboardAnalytics } from "./analytics.js";
import { quotaHeaders } from "./billing.js";
import { aggregateDetectorNoise, buildDigestPayload, generateTuningYaml, recommendPolicyTuning, } from "./feedback-core.js";
import { buildAgentRecentEvaluations, buildTuningDigestV1, evaluateAutoDowngradeCandidates, } from "./tuning-digest.js";
import { createMemoryStore, parseSeedKeys } from "./store.js";
import { DeployEventPayload, DigestSubscribePayload, EvaluationPayload, FeedbackPayload, OrgSettingsPatch, } from "./types.js";
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
function buildRateLimitHeaders(state) {
    return {
        "RateLimit-Limit": String(state.limit),
        "RateLimit-Remaining": String(Math.max(0, state.remaining)),
        "RateLimit-Reset": String(Math.ceil(state.resetAt / 1000)),
    };
}
function consumeRateLimit(buckets, orgId) {
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
async function applyQuotaHeaders(c, store, orgId) {
    const quota = await store.getQuota(orgId);
    for (const [header, value] of Object.entries(quotaHeaders(quota.plan, quota.used))) {
        c.header(header, value);
    }
}
export function createCloudApp(options = {}) {
    const store = options.store ?? createMemoryStore(options.seedKeys ?? []);
    const rateBuckets = new Map();
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
        const keyRecord = await store.getOrgForKey(token);
        if (!keyRecord) {
            return c.json({ error: "invalid API key" }, 401);
        }
        if (keyRecord.suspended) {
            return c.json({
                error: "subscription payment required — reactivate your plan to resume the Trailhead Cloud API",
                reactivateUrl: process.env.TRAILHEAD_BILLING_PORTAL_HINT ?? null,
            }, 402);
        }
        c.set("orgId", keyRecord.orgId);
        c.set("orgName", keyRecord.orgName);
        c.set("apiKey", token);
        const rate = consumeRateLimit(rateBuckets, keyRecord.orgId);
        for (const [header, value] of Object.entries(buildRateLimitHeaders(rate))) {
            c.header(header, value);
        }
        if (rate.remaining < 0) {
            return c.json({ error: "rate limit exceeded", code: "rate_limited" }, 429);
        }
        await applyQuotaHeaders(c, store, keyRecord.orgId);
        await next();
    });
    app.post("/v1/evaluations", async (c) => {
        const orgId = c.get("orgId");
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: "invalid JSON" }, 400);
        }
        const parsed = EvaluationPayload.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: "invalid evaluation payload", details: parsed.error.flatten() }, 400);
        }
        const idempotencyKey = c.req.header("Idempotency-Key") ?? parsed.data.id;
        const result = await store.ingestEvaluation(orgId, parsed.data, idempotencyKey);
        // Hard abuse backstop: at/above 3× the tier limit → fail closed (429).
        if (result.hardLimited) {
            const quota = await store.getQuota(orgId);
            return c.json({
                error: "evaluation hard limit reached — usage is far above your plan's monthly quota. Upgrade to keep ingesting.",
                code: "hard_cap_exceeded",
                plan: quota.plan,
                limit: quota.limit,
                used: quota.used,
                upgradeUrl: process.env.TRAILHEAD_BILLING_PORTAL_HINT ?? null,
            }, 429);
        }
        // Not stored + not hard-limited → plan does not include the cloud store
        // (free key). Preserve the historical 403 behavior.
        if (!result.created && result.quotaExceeded) {
            const quota = await store.getQuota(orgId);
            return c.json({
                error: "evaluation quota exceeded or plan does not include cloud store",
                plan: quota.plan,
                limit: quota.limit,
                used: quota.used,
            }, 403);
        }
        await applyQuotaHeaders(c, store, orgId);
        // Soft over-quota (still stored during launch) → 200 + advisory header/body.
        if (result.quotaExceeded) {
            c.header("X-Trailhead-Quota-Exceeded", "true");
            const quota = await store.getQuota(orgId);
            return c.json({
                id: result.evaluation.id,
                created: result.created,
                receivedAt: result.evaluation.receivedAt,
                quotaExceeded: true,
                message: `You have exceeded your ${quota.plan} plan's monthly quota of ${quota.limit} evaluations. Evaluations are still being stored — upgrade to avoid interruption.`,
            }, 200);
        }
        return c.json({
            id: result.evaluation.id,
            created: result.created,
            receivedAt: result.evaluation.receivedAt,
        }, result.created ? 201 : 200);
    });
    app.get("/v1/evaluations", async (c) => {
        const orgId = c.get("orgId");
        const repoId = c.req.query("repo_id");
        const prNumberRaw = c.req.query("pr_number");
        const limitRaw = c.req.query("limit");
        const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
        const prNumber = prNumberRaw && Number.isFinite(parseInt(prNumberRaw, 10))
            ? parseInt(prNumberRaw, 10)
            : undefined;
        const rows = await store.listEvaluations(orgId, repoId, limit, prNumber);
        return c.json({ evaluations: rows, count: rows.length });
    });
    app.get("/v1/evaluations/:id", async (c) => {
        const orgId = c.get("orgId");
        const row = await store.getEvaluation(orgId, c.req.param("id"));
        if (!row) {
            return c.json({ error: "evaluation not found" }, 404);
        }
        return c.json({ evaluation: row });
    });
    app.get("/v1/analytics/dashboard", async (c) => {
        const orgId = c.get("orgId");
        const repoId = c.req.query("repo_id");
        const daysRaw = c.req.query("days");
        const days = daysRaw ? parseInt(daysRaw, 10) : 30;
        const windowDays = Number.isFinite(days) && days > 0 ? days : 30;
        const analytics = buildDashboardAnalytics(await store.listAllEvaluations(orgId), await store.listDeployEvents(orgId), { repoId: repoId || undefined, days: windowDays });
        const feedbackRows = await store.listFeedback(orgId, repoId || undefined);
        const noise = aggregateDetectorNoise(feedbackRows, { repo: repoId || undefined });
        const tuning = recommendPolicyTuning(feedbackRows, { repo: repoId || undefined });
        const recentEvaluations = await store.listEvaluations(orgId, repoId || undefined, 50);
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
    app.get("/v1/analytics/agent-loop-efficiency", async (c) => {
        const orgId = c.get("orgId");
        const repoId = c.req.query("repo_id");
        const daysRaw = c.req.query("days");
        const days = daysRaw ? parseInt(daysRaw, 10) : 30;
        const windowDays = Number.isFinite(days) && days > 0 ? days : 30;
        const analytics = buildDashboardAnalytics(await store.listAllEvaluations(orgId), await store.listDeployEvents(orgId), { repoId: repoId || undefined, days: windowDays });
        return c.json({ agentLoopEfficiency: analytics.agentLoopEfficiency });
    });
    app.post("/v1/feedback", async (c) => {
        const orgId = c.get("orgId");
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: "invalid JSON" }, 400);
        }
        const parsed = FeedbackPayload.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: "invalid feedback payload", details: parsed.error.flatten() }, 400);
        }
        const stored = await store.recordFeedback({
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
    app.get("/v1/feedback/noise", async (c) => {
        const orgId = c.get("orgId");
        const repoId = c.req.query("repo_id") || undefined;
        const thresholdRaw = c.req.query("fp_threshold");
        const fpThreshold = thresholdRaw ? parseInt(thresholdRaw, 10) : 15;
        const records = await store.listFeedback(orgId, repoId);
        return c.json(aggregateDetectorNoise(records, { repo: repoId, fpThreshold }));
    });
    app.get("/v1/feedback/tuning", async (c) => {
        const orgId = c.get("orgId");
        const repoId = c.req.query("repo_id") || undefined;
        const thresholdRaw = c.req.query("fp_threshold");
        const falsePositiveThreshold = thresholdRaw ? parseInt(thresholdRaw, 10) : 15;
        const records = await store.listFeedback(orgId, repoId);
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
        const orgId = c.get("orgId");
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: "invalid JSON" }, 400);
        }
        const parsed = DigestSubscribePayload.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: "invalid digest payload", details: parsed.error.flatten() }, 400);
        }
        const settings = await store.updateOrgSettings(orgId, {
            digest: {
                enabled: parsed.data.enabled,
                channel: parsed.data.channel,
                destination: parsed.data.destination,
                fpThreshold: parsed.data.fpThreshold,
            },
        });
        return c.json({ digest: settings.digest });
    });
    app.get("/v1/digest/preview", async (c) => {
        const orgId = c.get("orgId");
        const orgName = c.get("orgName");
        const repoId = c.req.query("repo_id") || undefined;
        const schema = c.req.query("schema") ?? "legacy";
        const settings = await store.getOrgSettings(orgId);
        const fpThreshold = settings.digest?.fpThreshold ?? 15;
        if (schema === "v1" && repoId) {
            const digest = buildTuningDigestV1({
                repoId,
                evaluations: await store.listAllEvaluations(orgId),
                feedback: await store.listFeedback(orgId, repoId),
                downgrades: await store.listDetectorDowngrades(orgId),
                fpThreshold: fpThreshold / 100,
            });
            return c.json({
                enabled: settings.digest?.enabled ?? false,
                channel: settings.digest?.channel ?? null,
                destination: settings.digest?.destination ?? null,
                ...digest,
            });
        }
        const noise = aggregateDetectorNoise(await store.listFeedback(orgId), {
            fpThreshold,
        });
        const digest = buildDigestPayload(noise, orgName);
        return c.json({
            enabled: settings.digest?.enabled ?? false,
            channel: settings.digest?.channel ?? null,
            destination: settings.digest?.destination ?? null,
            ...digest,
        });
    });
    app.get("/v1/digest/tuning", async (c) => {
        const orgId = c.get("orgId");
        const repoId = c.req.query("repo_id");
        if (!repoId) {
            return c.json({ error: "repo_id query parameter is required" }, 400);
        }
        const daysRaw = c.req.query("days");
        const days = daysRaw ? parseInt(daysRaw, 10) : 7;
        const settings = await store.getOrgSettings(orgId);
        const fpThreshold = (settings.digest?.fpThreshold ?? 15) / 100;
        const digest = buildTuningDigestV1({
            repoId,
            evaluations: await store.listAllEvaluations(orgId),
            feedback: await store.listFeedback(orgId, repoId),
            downgrades: await store.listDetectorDowngrades(orgId),
            days: Number.isFinite(days) && days > 0 ? days : 7,
            fpThreshold,
        });
        return c.json(digest);
    });
    app.post("/v1/digest/tuning/deliver", async (c) => {
        const orgId = c.get("orgId");
        const settings = await store.getOrgSettings(orgId);
        if (!settings.digest?.enabled || !settings.digest.destination) {
            return c.json({ error: "digest not configured — subscribe first" }, 400);
        }
        const daysRaw = c.req.query("days");
        const days = daysRaw ? parseInt(daysRaw, 10) : 7;
        const fpThreshold = (settings.digest.fpThreshold ?? 15) / 100;
        const repos = await store.listRepos(orgId);
        const delivered = [];
        for (const repo of repos) {
            const digest = buildTuningDigestV1({
                repoId: repo.fullName,
                evaluations: await store.listAllEvaluations(orgId),
                feedback: await store.listFeedback(orgId, repo.fullName),
                downgrades: await store.listDetectorDowngrades(orgId),
                days: Number.isFinite(days) && days > 0 ? days : 7,
                fpThreshold,
            });
            const response = await fetch(settings.digest.destination, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(digest),
                signal: AbortSignal.timeout(10_000),
            });
            delivered.push({ repo: repo.fullName, status: response.status });
        }
        return c.json({ delivered, count: delivered.length });
    });
    app.get("/v1/agents/:agentId/recent-evaluations", async (c) => {
        const orgId = c.get("orgId");
        const agentId = c.req.param("agentId");
        const repoId = c.req.query("repo_id") || undefined;
        const daysRaw = c.req.query("days");
        const days = daysRaw ? parseInt(daysRaw, 10) : 30;
        const stats = buildAgentRecentEvaluations({
            agentId,
            evaluations: await store.listAllEvaluations(orgId),
            repoId,
            days: Number.isFinite(days) && days > 0 ? days : 30,
        });
        return c.json(stats);
    });
    app.post("/v1/tuning/auto-downgrade/run", async (c) => {
        const orgId = c.get("orgId");
        const settings = await store.getOrgSettings(orgId);
        if (settings.tuning?.autoDowngrade === false) {
            return c.json({ skipped: true, reason: "auto_downgrade disabled for org" });
        }
        const daysRaw = c.req.query("days");
        const days = daysRaw ? parseInt(daysRaw, 10) : 7;
        const fpThreshold = (settings.digest?.fpThreshold ?? 15) / 100;
        const candidates = evaluateAutoDowngradeCandidates({
            evaluations: await store.listAllEvaluations(orgId),
            feedback: await store.listFeedback(orgId),
            downgrades: await store.listDetectorDowngrades(orgId),
            days: Number.isFinite(days) && days > 0 ? days : 7,
            fpThreshold,
        });
        const applied = [];
        for (const candidate of candidates) {
            const record = {
                detectorCode: candidate.detector,
                downgradedAt: new Date().toISOString(),
                fpRateAtTrigger: candidate.fpRate,
                tuningIssueUrl: `https://github.com/KomatikAI/trailhead/issues/new?title=${encodeURIComponent(`[tune] detector ${candidate.detector} auto-downgraded (FP rate ${Math.round(candidate.fpRate * 100)}%)`)}`,
            };
            await store.recordDetectorDowngrade(orgId, record);
            applied.push(record);
            const destination = settings.digest?.destination;
            if (destination) {
                await fetch(destination, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        event: "trailhead.detector_auto_downgraded",
                        detector: candidate.detector,
                        fp_rate: candidate.fpRate,
                        emissions: candidate.emissions,
                        tuning_issue: record.tuningIssueUrl,
                    }),
                    signal: AbortSignal.timeout(10_000),
                }).catch(() => undefined);
            }
        }
        return c.json({ applied, count: applied.length });
    });
    app.get("/v1/org/settings", async (c) => {
        const orgId = c.get("orgId");
        const settings = await store.getOrgSettings(orgId);
        const quota = await store.getQuota(orgId);
        return c.json({ settings, quota, plans: ["free", "pro", "team"] });
    });
    app.put("/v1/org/settings", async (c) => {
        const orgId = c.get("orgId");
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: "invalid JSON" }, 400);
        }
        const parsed = OrgSettingsPatch.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: "invalid settings", details: parsed.error.flatten() }, 400);
        }
        const current = await store.getOrgSettings(orgId);
        if (parsed.data.sso?.enabled && current.plan !== "team") {
            return c.json({ error: "SSO requires Team plan" }, 403);
        }
        const settings = await store.updateOrgSettings(orgId, parsed.data);
        return c.json({ settings, quota: await store.getQuota(orgId) });
    });
    app.get("/v1/api-keys", async (c) => {
        const orgId = c.get("orgId");
        const keys = (await store.listManagedKeys(orgId)).map(({ key: _key, ...rest }) => rest);
        return c.json({ keys, count: keys.length });
    });
    app.post("/v1/api-keys", async (c) => {
        const orgId = c.get("orgId");
        let label;
        try {
            const body = await c.req.json();
            label = typeof body?.label === "string" ? body.label : undefined;
        }
        catch {
            label = undefined;
        }
        try {
            const created = await store.createApiKey(orgId, label);
            return c.json({
                key: {
                    id: created.key.id,
                    label: created.key.label,
                    keyPreview: created.key.keyPreview,
                    createdAt: created.key.createdAt,
                },
                secret: created.secret,
            }, 201);
        }
        catch (error) {
            return c.json({ error: String(error) }, 403);
        }
    });
    app.delete("/v1/api-keys/:id", async (c) => {
        const orgId = c.get("orgId");
        const revoked = await store.revokeApiKey(orgId, c.req.param("id"));
        if (!revoked) {
            return c.json({ error: "key not found" }, 404);
        }
        return c.json({ revoked: true });
    });
    app.post("/v1/deploy-events", async (c) => {
        const orgId = c.get("orgId");
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: "invalid JSON" }, 400);
        }
        const parsed = DeployEventPayload.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: "invalid deploy event payload", details: parsed.error.flatten() }, 400);
        }
        await store.recordDeployEvent(orgId, parsed.data);
        return c.json({ received: true }, 201);
    });
    app.get("/v1/orgs", async (c) => {
        const orgId = c.get("orgId");
        const orgs = (await store.listOrgs()).filter((o) => o.id === orgId);
        const settings = await store.getOrgSettings(orgId);
        return c.json({ orgs, plan: settings.plan });
    });
    app.get("/v1/repos", async (c) => {
        const orgId = c.get("orgId");
        const repos = await store.listRepos(orgId);
        return c.json({ repos, count: repos.length });
    });
    return app;
}
export function createDefaultCloudApp() {
    const seedKeys = parseSeedKeys(process.env.TRAILHEAD_CLOUD_API_KEYS);
    return createCloudApp({ seedKeys });
}
