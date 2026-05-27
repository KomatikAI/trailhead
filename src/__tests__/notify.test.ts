import { vi } from "vitest";

import {
  deliverWebhooks,
  deliverWebhookEvent,
  sendWebhook,
  storeEvaluation,
} from "../notify.js";
import { buildRemediation } from "../remediation.js";
import type { GateEvaluation } from "../types.js";

vi.mock("@actions/core", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@actions/github", () => ({
  context: {
    repo: { owner: "test-owner", repo: "test-repo" },
  },
}));

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeEvaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "dg-test",
    repoId: "test-owner/test-repo",
    commitSha: "abc1234567890",
    healthScore: 100,
    riskScore: 85,
    gateDecision: "block",
    healthChecks: [],
    riskFactors: [{ type: "code_churn", score: 80, detail: { totalChanges: 2000 } }],
    evaluationMs: 50,
    prNumber: 42,
    ...overrides,
  };
}

describe("sendWebhook", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the correct payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await sendWebhook("https://hooks.slack.com/test", makeEvaluation());

    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.decision).toBe("block");
    expect(body.riskScore).toBe(85);
    expect(body.healthScore).toBe(100);
    expect(body.repoId).toBe("test-owner/test-repo");
    expect(body.prNumber).toBe(42);
    expect(body.prUrl).toBe("https://github.com/test-owner/test-repo/pull/42");
    expect(body.commitSha).toBe("abc1234567890");
    expect(body.timestamp).toBeDefined();
  });

  it("includes Slack-compatible text field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await sendWebhook("https://hooks.slack.com/test", makeEvaluation());

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.text).toContain("BLOCK");
    expect(body.text).toContain("risk 85/100");
    expect(body.text).toContain("PR #42");
  });

  it("handles missing prNumber gracefully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await sendWebhook(
      "https://hooks.slack.com/test",
      makeEvaluation({ prNumber: undefined }),
    );

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.prUrl).toBeUndefined();
    expect(body.text).toContain("abc1234");
  });

  it("handles non-200 response gracefully (fail-open)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("error", { status: 500 }));
    await expect(
      sendWebhook("https://hooks.slack.com/test", makeEvaluation()),
    ).resolves.toBeUndefined();
  });

  it("handles network error gracefully (fail-open)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      sendWebhook("https://hooks.slack.com/test", makeEvaluation()),
    ).resolves.toBeUndefined();
  });
});

describe("deliverWebhooks", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts legacy and semantic payloads when both are subscribed", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("ok", { status: 200 }));
    const remediation = buildRemediation({
      evaluation: {
        id: "eval-1",
        riskFactors: [
          { type: "test_coverage", score: 80, detail: { missing_tests: ["src/x.ts"] } },
        ],
        gateDecision: "block",
        releaseReady: false,
      },
    });
    await deliverWebhooks(
      "https://hooks.example/events",
      makeEvaluation({
        gateDecision: "block",
        releaseReady: false,
        remediation,
        pr: { headRef: "agent/frontend-dev/fix-nav" },
      }),
      ["block", "trailhead.blocked"],
      { riskThreshold: 70 },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const legacy = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    const semantic = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(legacy.schema).toBeUndefined();
    expect(legacy.decision).toBe("block");
    expect(semantic.schema).toBe("trailhead.webhook.v1");
    expect(semantic.event).toBe("trailhead.blocked");
    expect(semantic.remediation.schema).toBe("trailhead.remediation.v1");
    expect(semantic.prUrl).toBe("https://github.com/test-owner/test-repo/pull/42");
    expect(semantic.headRef).toBe("agent/frontend-dev/fix-nav");
  });

  it("deliverWebhookEvent sends semantic payload only", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await deliverWebhookEvent(
      "https://hooks.example/events",
      makeEvaluation({ releaseReady: true }),
      { event: "trailhead.ready", kind: "trailhead" },
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.event).toBe("trailhead.ready");
    expect(body.releaseReady).toBe(true);
  });
});

describe("storeEvaluation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.EVALUATION_STORE_SECRET;
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EVALUATION_STORE_SECRET;
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("sends evaluation as POST body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"stored":true}'));
    const eval_ = makeEvaluation();
    await storeEvaluation("https://example.com/api/trailhead/store", eval_);

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/api/trailhead/store",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.id).toBe("dg-test");
    expect(body.riskScore).toBe(85);
    expect(body.gateDecision).toBe("block");
  });

  it("includes Authorization header when EVALUATION_STORE_SECRET is set", async () => {
    process.env.EVALUATION_STORE_SECRET = "my-secret";
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"stored":true}'));
    await storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation());

    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-secret");
    expect(headers["Idempotency-Key"]).toBe("dg-test");
  });

  it("sends x-vercel-protection-bypass when VERCEL_AUTOMATION_BYPASS_SECRET is set", async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "bypass-token";
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"stored":true}'));
    await storeEvaluation("https://example.com/api/store", makeEvaluation());
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["x-vercel-protection-bypass"]).toBe("bypass-token");
  });

  it("omits Authorization header when no secret is set", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"stored":true}'));
    await storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation());

    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("falls back to Supabase REST when primary returns HTML after retries", async () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.useFakeTimers();
    const html429 = () =>
      new Response("<html>checkpoint</html>", {
        status: 429,
        headers: { "Content-Type": "text/html" },
      });
    vi.mocked(fetch)
      .mockResolvedValueOnce(html429())
      .mockResolvedValueOnce(html429())
      .mockResolvedValueOnce(html429())
      .mockResolvedValueOnce(html429())
      .mockResolvedValueOnce(jsonResponse("", 201));

    const promise = storeEvaluation("https://app.example/api/store", makeEvaluation());
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(promise).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledTimes(5);
    const supUrl = vi.mocked(fetch).mock.calls[4][0] as string;
    expect(supUrl).toContain("supabase.co/rest/v1/trailhead_evaluations");
    const row = JSON.parse(vi.mocked(fetch).mock.calls[4][1]!.body as string);
    expect(row.gate_decision).toBe("block");
    expect(row.risk_score).toBe(85);
    expect(row.loop_round).toBe(0);
    expect(row.fixes_resolved).toEqual([]);
    vi.useRealTimers();
  });

  it("handles non-JSON success from primary then skips when no Supabase env", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<html/>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    await storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles non-200 JSON response gracefully (fail-open)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"error":"nope"}', 500));
    await expect(
      storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation()),
    ).resolves.toBe(false);
  });

  it("handles network error gracefully (fail-open)", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const promise = storeEvaluation(
      "https://example.com/api/trailhead/store",
      makeEvaluation(),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(promise).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("retries on 503 with exponential backoff then succeeds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse('{"error":"unavailable"}', 503))
      .mockResolvedValueOnce(jsonResponse('{"error":"unavailable"}', 503))
      .mockResolvedValueOnce(jsonResponse('{"stored":true}'));

    const promise = storeEvaluation(
      "https://example.com/api/trailhead/store",
      makeEvaluation(),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(promise).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("does not retry on 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"error":"unauthorized"}', 401));
    await expect(
      storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation()),
    ).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 403", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"error":"forbidden"}', 403));
    await expect(
      storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation()),
    ).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honors maxRetries=0 with a single attempt", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse('{"error":"unavailable"}', 503));
    await expect(
      storeEvaluation("https://example.com/api/trailhead/store", makeEvaluation(), {
        maxRetries: 0,
      }),
    ).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on network error then succeeds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(jsonResponse('{"stored":true}'));

    const promise = storeEvaluation(
      "https://example.com/api/trailhead/store",
      makeEvaluation(),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
