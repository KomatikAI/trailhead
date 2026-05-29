import { vi } from "vitest";

import {
  meterDeployCheck,
  resolveCreditMeterConfig,
  resolveCreditMeterUserFromEnv,
} from "../credit-meter.js";
import type { GateEvaluation } from "../types.js";

function makeEvaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "dg-abc123-999",
    repoId: "KomatikAI/komatik",
    commitSha: "abc1234567890",
    healthScore: 100,
    riskScore: 20,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 50,
    prNumber: 7,
    releaseReady: true,
    ...overrides,
  };
}

describe("credit-meter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.TRAILHEAD_CREDIT_USER_ID;
    delete process.env.TRAILHEAD_CREDIT_USER_EMAIL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveCreditMeterConfig requires url and secret", () => {
    expect(resolveCreditMeterConfig({ url: "", secret: "s" }).enabled).toBe(false);
    expect(
      resolveCreditMeterConfig({ url: "https://x/ingest", secret: "s" }).enabled,
    ).toBe(true);
    expect(
      resolveCreditMeterConfig({ url: "https://x/ingest", secret: "s", shadow: false })
        .shadow,
    ).toBe(false);
  });

  it("resolveCreditMeterUserFromEnv prefers user id", () => {
    process.env.TRAILHEAD_CREDIT_USER_ID = "uuid-1";
    process.env.TRAILHEAD_CREDIT_USER_EMAIL = "a@b.com";
    expect(resolveCreditMeterUserFromEnv()).toEqual({
      userId: "uuid-1",
      email: "a@b.com",
    });
  });

  it("meterDeployCheck skips when not configured", async () => {
    const result = await meterDeployCheck(
      makeEvaluation(),
      resolveCreditMeterConfig({}),
      { email: "u@komatik.ai" },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("not_configured");
  });

  it("meterDeployCheck posts shadow deploy_check to ingest", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, shadow: true, would_charge: 30 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const config = resolveCreditMeterConfig({
      url: "https://github.com/functions/v1/credit-meter-ingest",
      secret: "test-secret",
      shadow: true,
    });

    const result = await meterDeployCheck(makeEvaluation(), config, {
      userId: "user-uuid",
    });

    expect(result.metered).toBe(true);
    expect(result.shadow).toBe(true);
    expect(result.would_charge).toBe(30);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("credit-meter-ingest");
    expect((init.headers as Record<string, string>)["x-komatik-meter-secret"]).toBe(
      "test-secret",
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.appSlug).toBe("trailhead");
    expect(body.actionSlug).toBe("deploy_check");
    expect(body.shadow).toBe(true);
    expect(body.userId).toBe("user-uuid");
    expect(body.idempotencyKey).toBe("deploy-check:dg-abc123-999");
  });

  it("meterDeployCheck handles not_a_member skip response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, skipped: true, reason: "not_a_member" }), {
        status: 200,
      }),
    );

    const result = await meterDeployCheck(
      makeEvaluation(),
      resolveCreditMeterConfig({
        url: "https://github.com/ingest",
        secret: "s",
      }),
      { email: "anon@example.com" },
    );

    expect(result.metered).toBe(false);
    expect(result.reason).toBe("not_a_member");
  });
});
