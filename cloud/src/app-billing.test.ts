import { afterEach, describe, expect, it } from "vitest";
import { createCloudApp } from "./app.js";
import type {
  ApiKeyRecord,
  CloudStore,
  IngestResult,
  QuotaSnapshot,
  StoredEvaluation,
} from "./types.js";

/**
 * Minimal stub covering only the auth-middleware + POST /v1/evaluations path
 * (getOrgForKey, getQuota, ingestEvaluation). Lets us assert the billing HTTP
 * responses without seeding thousands of evaluations.
 */
function stubStore(opts: {
  suspended?: boolean;
  quota?: Partial<QuotaSnapshot>;
  ingest?: Partial<IngestResult>;
}): CloudStore {
  const quota: QuotaSnapshot = {
    plan: "pro",
    limit: 5000,
    used: 0,
    remaining: 5000,
    ...opts.quota,
  };
  const keyRecord: ApiKeyRecord = {
    keyId: "k1",
    key: "",
    orgId: "org1",
    orgName: "Org One",
    suspended: opts.suspended ?? false,
  };
  const evaluation = {
    id: "e1",
    receivedAt: "2026-07-02T00:00:00.000Z",
  } as StoredEvaluation;
  const result: IngestResult = { created: true, evaluation, ...opts.ingest };
  return {
    getOrgForKey: async () => keyRecord,
    getQuota: async () => quota,
    ingestEvaluation: async () => result,
  } as unknown as CloudStore;
}

function post(app: ReturnType<typeof createCloudApp>) {
  return app.request("/v1/evaluations", {
    method: "POST",
    headers: {
      Authorization: "Bearer thk_test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "e1",
      repoId: "acme/repo",
      commitSha: "abc",
      healthScore: 100,
      riskScore: 10,
      gateDecision: "allow",
      evaluationMs: 5,
    }),
  });
}

describe("app billing responses", () => {
  afterEach(() => {
    delete process.env.TRAILHEAD_BILLING_PORTAL_HINT;
  });

  it("suspended key → 402 with reactivateUrl", async () => {
    process.env.TRAILHEAD_BILLING_PORTAL_HINT = "https://billing.example/portal";
    const app = createCloudApp({ store: stubStore({ suspended: true }) });
    const res = await post(app);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { reactivateUrl: string; error: string };
    expect(body.reactivateUrl).toBe("https://billing.example/portal");
    expect(body.error).toMatch(/payment required/i);
  });

  it("hard-limited ingest → 429 upsell", async () => {
    const app = createCloudApp({
      store: stubStore({
        quota: { used: 15000 },
        ingest: { created: false, quotaExceeded: true, hardLimited: true },
      }),
    });
    const res = await post(app);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/hard limit/i);
  });

  it("soft over-quota ingest → 200 + X-Trailhead-Quota-Exceeded header + body flag", async () => {
    const app = createCloudApp({
      store: stubStore({
        quota: { used: 5001, remaining: 0 },
        ingest: { created: true, quotaExceeded: true },
      }),
    });
    const res = await post(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Trailhead-Quota-Exceeded")).toBe("true");
    const body = (await res.json()) as { quotaExceeded: boolean; message: string };
    expect(body.quotaExceeded).toBe(true);
    expect(body.message).toMatch(/quota/i);
  });

  it("free/plan-blocked ingest → 403 (historical behavior)", async () => {
    const app = createCloudApp({
      store: stubStore({
        quota: { plan: "free", limit: 0, remaining: 0 },
        ingest: { created: false, quotaExceeded: true },
      }),
    });
    const res = await post(app);
    expect(res.status).toBe(403);
  });

  it("normal ingest → 201, no quota-exceeded header", async () => {
    const app = createCloudApp({ store: stubStore({}) });
    const res = await post(app);
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Trailhead-Quota-Exceeded")).toBeNull();
  });
});
