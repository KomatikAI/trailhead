import { beforeEach, describe, expect, it } from "vitest";
import { createCloudApp } from "./app.js";
import type { ApiKeyRecord } from "./types.js";

const seedKeys: ApiKeyRecord[] = [
  { keyId: "seed-komatik", orgId: "komatik", orgName: "Komatik", key: "thk_test_key" },
];

function authHeaders(key = "thk_test_key"): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function sampleEvaluation(id = "eval-1") {
  return {
    id,
    repoId: "KomatikAI/trailhead",
    commitSha: "abc1234567890",
    prNumber: 42,
    healthScore: 100,
    riskScore: 25,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 50,
    releaseReady: true,
  };
}

describe("Trailhead Cloud API", () => {
  let app: ReturnType<typeof createCloudApp>;

  beforeEach(() => {
    app = createCloudApp({ seedKeys });
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/v1/evaluations", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("ingests evaluation and auto-registers repo", async () => {
    const res = await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(sampleEvaluation()),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; created: boolean };
    expect(body.created).toBe(true);
    expect(body.id).toBe("eval-1");
    expect(res.headers.get("RateLimit-Limit")).toBe("120");

    const repos = await app.request("/v1/repos", { headers: authHeaders() });
    const reposBody = (await repos.json()) as { repos: Array<{ fullName: string }> };
    expect(reposBody.repos.some((r) => r.fullName === "KomatikAI/trailhead")).toBe(true);
  });

  it("treats duplicate Idempotency-Key as no-op", async () => {
    const payload = sampleEvaluation("eval-dup");
    const headers = {
      ...authHeaders(),
      "Idempotency-Key": "eval-dup",
    };

    const first = await app.request("/v1/evaluations", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);

    const second = await app.request("/v1/evaluations", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, riskScore: 99 }),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { created: boolean };
    expect(body.created).toBe(false);

    const list = await app.request("/v1/evaluations?repo_id=KomatikAI/trailhead", {
      headers: authHeaders(),
    });
    const listBody = (await list.json()) as { evaluations: Array<{ riskScore: number }> };
    expect(listBody.evaluations.find((e) => e.id === "eval-dup")?.riskScore).toBe(25);
  });

  it("filters evaluations by pr_number", async () => {
    await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...sampleEvaluation("pr-42-a"), prNumber: 42 }),
    });
    await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...sampleEvaluation("pr-99-a"), prNumber: 99 }),
    });

    const res = await app.request(
      "/v1/evaluations?repo_id=KomatikAI/trailhead&pr_number=42",
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      evaluations: Array<{ id: string; prNumber?: number }>;
    };
    expect(body.evaluations.every((row) => row.prNumber === 42)).toBe(true);
    expect(body.evaluations.some((row) => row.id === "pr-42-a")).toBe(true);
  });

  it("accepts deploy events", async () => {
    const res = await app.request("/v1/deploy-events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        deploymentId: "dpl_1",
        environment: "production",
        status: "success",
        timestamp: new Date().toISOString(),
        source: "vercel",
        repoId: "KomatikAI/trailhead",
        commitSha: "abc1234567890",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("lists org for authenticated key", async () => {
    const res = await app.request("/v1/orgs", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgs: Array<{ id: string }> };
    expect(body.orgs).toEqual([expect.objectContaining({ id: "komatik" })]);
  });

  it("returns dashboard analytics", async () => {
    await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...sampleEvaluation("analytics-1"),
        releaseReady: true,
        context: { name: "main-pr" },
        ci: { failedCount: 0, checks: [] },
      }),
    });
    await app.request("/v1/deploy-events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        deploymentId: "d-analytics",
        environment: "production",
        status: "failure",
        timestamp: new Date().toISOString(),
        repoId: "KomatikAI/trailhead",
      }),
    });

    const res = await app.request("/v1/analytics/dashboard?days=30", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      releaseReady: { pass: number };
      cfr: { failures: number };
      recentEvaluations: unknown[];
    };
    expect(body.releaseReady.pass).toBeGreaterThan(0);
    expect(body.cfr.failures).toBe(1);
    expect(body.recentEvaluations.length).toBeGreaterThan(0);
  });

  it("returns evaluation drill-down by id", async () => {
    await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...sampleEvaluation("drill-1"),
        riskFactors: [{ type: "code_churn", score: 42 }],
        ci: { failedCount: 1, checks: [{ name: "CI", status: "fail", required: true }] },
      }),
    });

    const res = await app.request("/v1/evaluations/drill-1", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { evaluation: { id: string } };
    expect(body.evaluation.id).toBe("drill-1");
  });

  it("records feedback and returns detector noise", async () => {
    const post = await app.request("/v1/feedback", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        detector: "supply_chain",
        disposition: "false_positive",
        repo: "KomatikAI/trailhead",
        reason: "Known safe dependency bump",
      }),
    });
    expect(post.status).toBe(201);

    const noise = await app.request("/v1/feedback/noise?repo_id=KomatikAI/trailhead", {
      headers: authHeaders(),
    });
    expect(noise.status).toBe(200);
    const body = (await noise.json()) as { detectors: Array<{ noisy: boolean }> };
    expect(body.detectors[0]?.noisy).toBe(true);
  });

  it("returns tuning proposal with YAML snippet", async () => {
    for (let i = 0; i < 5; i += 1) {
      await app.request("/v1/feedback", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          detector: "duplicate_logic",
          disposition: "false_positive",
          repo: "KomatikAI/trailhead",
        }),
      });
    }
    const res = await app.request("/v1/feedback/tuning?repo_id=KomatikAI/trailhead", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      yamlSnippet: string;
      recommendations: unknown[];
    };
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.yamlSnippet).toContain("duplicate_logic:");
  });

  it("provisions and revokes API keys with quota headers", async () => {
    const create = await app.request("/v1/api-keys", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ label: "rotation" }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { secret: string; key: { id: string } };

    const list = await app.request("/v1/api-keys", { headers: authHeaders() });
    const listBody = (await list.json()) as { count: number };
    expect(listBody.count).toBeGreaterThan(1);

    const evalRes = await app.request("/v1/evaluations", {
      method: "POST",
      headers: {
        ...authHeaders(),
        Authorization: `Bearer ${created.secret}`,
      },
      body: JSON.stringify(sampleEvaluation("quota-test")),
    });
    expect(evalRes.status).toBe(201);
    expect(evalRes.headers.get("X-Trailhead-Plan")).toBe("pro");

    const revoke = await app.request(`/v1/api-keys/${created.key.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(revoke.status).toBe(200);
  });

  it("blocks SSO config on non-team plan", async () => {
    const res = await app.request("/v1/org/settings", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        sso: { enabled: true, provider: "oidc", issuerUrl: "https://idp.example.com" },
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns tuning digest v1 for a repo", async () => {
    await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...sampleEvaluation("tuning-1"),
        gateDecision: "warn",
        agentProvenanceId: "frontend-dev",
        remediation: {
          fixes: [{ code: "risk.test_coverage", severity: "warn" }],
        },
        pr: { headRef: "agent/frontend-dev/fix-nav" },
      }),
    });

    const res = await app.request(
      "/v1/digest/tuning?repo_id=KomatikAI/trailhead&days=30",
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schema: string; totals: { agent_prs: number } };
    expect(body.schema).toBe("trailhead.tuning-digest.v1");
    expect(body.totals.agent_prs).toBeGreaterThan(0);
  });

  it("returns per-agent recent evaluations", async () => {
    await app.request("/v1/evaluations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...sampleEvaluation("agent-1"),
        releaseReady: true,
        agentProvenanceId: "frontend-dev",
        remediation: { loop_round: 2, next_action: "ready_to_merge" },
      }),
    });

    const res = await app.request("/v1/agents/frontend-dev/recent-evaluations?days=30", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agent_id: string; evaluations: number };
    expect(body.agent_id).toBe("frontend-dev");
    expect(body.evaluations).toBeGreaterThan(0);
  });

  it("runs auto-downgrade when FP threshold exceeded", async () => {
    for (let i = 0; i < 10; i += 1) {
      await app.request("/v1/evaluations", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...sampleEvaluation(`ad-${i}`),
          gateDecision: "warn",
          remediation: {
            fixes: [{ code: "policy.duplicate_logic", severity: "warn" }],
          },
        }),
      });
    }
    for (let i = 0; i < 6; i += 1) {
      await app.request("/v1/feedback", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          detector: "policy.duplicate_logic",
          disposition: "false_positive",
          repo: "KomatikAI/trailhead",
        }),
      });
    }

    const res = await app.request("/v1/tuning/auto-downgrade/run", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBeGreaterThan(0);
  });
});
