import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { parseCiExternalWebhook } from "./ci-external.js";
import { defaultCiStatusStore } from "./ci-status-store.js";
import { handleDeploymentProtectionRule, verifySignature } from "./handler.js";
import { parseVercelPayload, parseGenericPayload, executeRollback } from "./rollback.js";

function logJson(level: string, msg: string, extra?: Record<string, unknown>): void {
  const entry = {
    level,
    msg,
    service: "trailhead-app",
    ts: new Date().toISOString(),
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export const app = new Hono();
app.use("/webhook", bodyLimit({ maxSize: 256 * 1024 }));
app.use("/webhook/*", bodyLimit({ maxSize: 256 * 1024 }));

function allowedCiRepositories(): Set<string> {
  const raw = process.env.CI_ALLOWED_REPOSITORIES ?? process.env.GITHUB_REPOSITORY ?? "";
  const repos = raw
    .split(",")
    .map((repo) => repo.trim().toLowerCase())
    .filter(Boolean);
  return repos.length && repos.every((repo) => /^[\w.-]+\/[\w.-]+$/.test(repo))
    ? new Set(repos)
    : new Set();
}

function validReadToken(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith("Bearer ") || !secret) return false;
  const token = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return token.length === expected.length && timingSafeEqual(token, expected);
}

app.get("/health", (c) => c.json({ status: "ok", service: "trailhead-app" }));

app.use("/dashboard/*", serveStatic({ root: "./public" }));
app.get("/dashboard", (c) => c.redirect("/dashboard/dashboard.html"));

app.post("/webhook", async (c) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!secret) return c.json({ error: "webhook not configured" }, 503);
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256") ?? "";
  if (!verifySignature(rawBody, signature, secret))
    return c.json({ error: "invalid signature" }, 401);
  const event = c.req.header("x-github-event");
  if (event !== "deployment_protection_rule") {
    return c.json({ skipped: true, reason: `unhandled event: ${event}` }, 200);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  try {
    await handleDeploymentProtectionRule(payload, rawBody, signature);
    return c.json({ ok: true });
  } catch (err) {
    logJson("error", "Webhook handler error", { error: String(err) });
    return c.json({ error: "internal error" }, 500);
  }
});

app.post("/webhook/deploy-outcome", async (c) => {
  const secret = process.env.CANARY_WEBHOOK_SECRET ?? "";
  if (!secret) return c.json({ error: "webhook not configured" }, 503);
  const rawBody = await c.req.text();

  const sig =
    c.req.header("x-signature-256") ?? c.req.header("x-hub-signature-256") ?? "";
  if (!verifySignature(rawBody, sig, secret)) {
    return c.json({ error: "invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return c.json({ error: "invalid payload" }, 400);
  const webhookType = (payload as Record<string, unknown>).type as string | undefined;
  const outcome =
    webhookType === "deployment" || (payload as Record<string, unknown>).payload
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
  const allowed = allowedCiRepositories();
  if (!secret || allowed.size === 0)
    return c.json({ error: "CI webhook not configured" }, 503);
  const rawBody = await c.req.text();

  const sig = c.req.header("x-trailhead-signature-256") ?? "";
  if (!verifySignature(rawBody, sig, secret)) {
    return c.json({ error: "invalid signature" }, 401);
  }

  let payload;
  try {
    payload = parseCiExternalWebhook(JSON.parse(rawBody));
  } catch {
    return c.json({ error: "invalid payload" }, 400);
  }

  const repo = payload.repo ?? process.env.GITHUB_REPOSITORY ?? "";
  if (!repo) {
    return c.json({ error: "repo required in payload or GITHUB_REPOSITORY env" }, 400);
  }
  if (!allowed.has(repo.toLowerCase()))
    return c.json({ error: "repository not allowed" }, 403);
  const observedAt = Date.parse(payload.generated_at ?? "");
  if (
    !/^[a-f0-9]{40}$/.test(payload.commit_sha) ||
    !Number.isFinite(observedAt) ||
    Math.abs(Date.now() - observedAt) > 5 * 60_000
  )
    return c.json({ error: "full commit SHA and fresh generated_at required" }, 400);
  const previous = defaultCiStatusStore.get(repo, payload.commit_sha);
  if (previous && observedAt <= Date.parse(previous.payload.generated_at ?? "")) {
    if (JSON.stringify(previous.payload) === JSON.stringify(payload))
      return c.json({ ok: true, jobs: payload.jobs.length });
    return c.json({ error: "older or conflicting observation" }, 409);
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
  const secret = process.env.CI_STATUS_READ_SECRET ?? "";
  const allowed = allowedCiRepositories();
  if (!secret || allowed.size === 0)
    return c.json({ error: "CI reader not configured" }, 503);
  if (!validReadToken(c.req.header("Authorization"), secret))
    return c.json({ error: "unauthorized" }, 401);
  const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
  const sha = c.req.param("sha");
  if (!allowed.has(fullName.toLowerCase()))
    return c.json({ error: "repository not allowed" }, 403);
  if (!/^[a-f0-9]{40}$/.test(sha))
    return c.json({ error: "full commit SHA required" }, 400);
  const entry = defaultCiStatusStore.get(fullName, sha);
  if (!entry) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(entry.payload);
});

app.get("/.well-known/trailhead.json", (c) =>
  c.json({
    name: "Trailhead",
    version: "4.2.0",
    description:
      "Deployment gate — scores code risk, checks production health, blocks dangerous releases.",
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
  }),
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  logJson("info", "Server starting", { port });
  serve({ fetch: app.fetch, port });
}
