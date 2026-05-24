import { describe, expect, it } from "vitest";
import { createCloudApp } from "./app.js";
import type { ApiKeyRecord } from "./types.js";

const seedKeys: ApiKeyRecord[] = [
  { orgId: "komatik", orgName: "Komatik", key: "thk_test_key" },
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
  const app = createCloudApp({ seedKeys });

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
});
