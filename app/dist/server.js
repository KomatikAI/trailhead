import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { parseCiExternalWebhook } from "./ci-external.js";
import { defaultCiStatusStore } from "./ci-status-store.js";
import { handleDeploymentProtectionRule, verifySignature } from "./handler.js";
import { parseVercelPayload, parseGenericPayload, executeRollback } from "./rollback.js";
function logJson(level, msg, extra) {
    const entry = {
        level,
        msg,
        service: "trailhead-app",
        ts: new Date().toISOString(),
        ...extra,
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
}
const app = new Hono();
app.get("/health", (c) => c.json({ status: "ok", service: "trailhead-app" }));
app.use("/dashboard/*", serveStatic({ root: "./public" }));
app.get("/dashboard", (c) => c.redirect("/dashboard/dashboard.html"));
app.post("/webhook", async (c) => {
    const event = c.req.header("x-github-event");
    if (event !== "deployment_protection_rule") {
        return c.json({ skipped: true, reason: `unhandled event: ${event}` }, 200);
    }
    const rawBody = await c.req.text();
    const signature = c.req.header("x-hub-signature-256") ?? "";
    const payload = JSON.parse(rawBody);
    try {
        await handleDeploymentProtectionRule(payload, rawBody, signature);
        return c.json({ ok: true });
    }
    catch (err) {
        logJson("error", "Webhook handler error", { error: String(err) });
        return c.json({ error: "internal error" }, 500);
    }
});
app.post("/webhook/deploy-outcome", async (c) => {
    const secret = process.env.CANARY_WEBHOOK_SECRET ?? "";
    const rawBody = await c.req.text();
    if (secret) {
        const sig = c.req.header("x-signature-256") ?? c.req.header("x-hub-signature-256") ?? "";
        if (!verifySignature(rawBody, sig, secret)) {
            return c.json({ error: "invalid signature" }, 401);
        }
    }
    let payload;
    try {
        payload = JSON.parse(rawBody);
    }
    catch {
        return c.json({ error: "invalid JSON" }, 400);
    }
    const webhookType = payload.type;
    const outcome = webhookType === "deployment" || payload.payload
        ? parseVercelPayload(payload)
        : parseGenericPayload(payload);
    if (!outcome) {
        return c.json({ received: true, parsed: false, type: webhookType ?? "unknown" });
    }
    logJson("info", "Deploy outcome received", {
        status: outcome.status,
        environment: outcome.environment,
        source: outcome.source,
    });
    const rollbackEnabled = process.env.ROLLBACK_ON_FAILURE === "true";
    if (outcome.status === "failure" && rollbackEnabled) {
        const githubToken = process.env.GITHUB_APP_INSTALLATION_TOKEN;
        const repoFullName = process.env.GITHUB_REPOSITORY;
        const rollbackResult = await executeRollback(outcome, githubToken, repoFullName);
        return c.json({
            received: true,
            outcome: {
                status: outcome.status,
                environment: outcome.environment,
                source: outcome.source,
            },
            rollback: rollbackResult,
        });
    }
    return c.json({
        received: true,
        outcome: {
            status: outcome.status,
            environment: outcome.environment,
            source: outcome.source,
        },
    });
});
app.post("/webhook/ci-status", async (c) => {
    const secret = process.env.CI_WEBHOOK_SECRET ?? "";
    const rawBody = await c.req.text();
    if (secret) {
        const sig = c.req.header("x-trailhead-signature-256") ?? "";
        if (!verifySignature(rawBody, sig, secret)) {
            return c.json({ error: "invalid signature" }, 401);
        }
    }
    let payload;
    try {
        payload = parseCiExternalWebhook(JSON.parse(rawBody));
    }
    catch {
        return c.json({ error: "invalid payload" }, 400);
    }
    const repo = payload.repo ?? process.env.GITHUB_REPOSITORY ?? "";
    if (!repo) {
        return c.json({ error: "repo required in payload or GITHUB_REPOSITORY env" }, 400);
    }
    defaultCiStatusStore.put(repo, payload.commit_sha, payload);
    logJson("info", "External CI status received", {
        repo,
        commit_sha: payload.commit_sha,
        source: payload.source,
        jobs: payload.jobs.length,
    });
    return c.json({ ok: true, jobs: payload.jobs.length });
});
app.get("/v1/ci-status/:owner/:repo/:sha", (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const sha = c.req.param("sha");
    const entry = defaultCiStatusStore.get(fullName, sha);
    if (!entry) {
        return c.json({ error: "not found" }, 404);
    }
    return c.json(entry.payload);
});
app.get("/.well-known/trailhead.json", (c) => c.json({
    name: "Trailhead",
    version: "4.2.0",
    description: "Deployment gate — scores code risk, checks production health, blocks dangerous releases.",
    capabilities: [
        "deployment-protection-rule",
        "risk-scoring",
        "health-checks",
        "dora-metrics",
        "security-alerts",
        "canary-hooks",
        "external-ci-webhook",
    ],
    homepage: "https://github.com/KomatikAI/trailhead",
}));
const port = parseInt(process.env.PORT ?? "3000", 10);
logJson("info", "Server starting", { port });
serve({ fetch: app.fetch, port });
//# sourceMappingURL=server.js.map