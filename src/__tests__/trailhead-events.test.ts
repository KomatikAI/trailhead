import {
  parseWebhookEvents,
  resolveTrailheadEventTypes,
  resolveWebhookDeliveries,
} from "../trailhead-events.js";
import { buildRemediation } from "../remediation.js";
import type { GateEvaluation } from "../types.js";

function evaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "eval-1",
    repoId: "owner/repo",
    commitSha: "abc1234567890",
    healthScore: 100,
    riskScore: 40,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 10,
    releaseReady: true,
    ...overrides,
  };
}

describe("parseWebhookEvents", () => {
  it("parses comma-separated event names", () => {
    const events = parseWebhookEvents(" warn, block ,trailhead.blocked ");
    expect(events.has("warn")).toBe(true);
    expect(events.has("block")).toBe(true);
    expect(events.has("trailhead.blocked")).toBe(true);
    expect(events.size).toBe(3);
  });
});

describe("resolveTrailheadEventTypes", () => {
  it("emits trailhead.blocked on block decision", () => {
    const events = resolveTrailheadEventTypes(
      evaluation({ gateDecision: "block", releaseReady: false }),
    );
    expect(events).toContain("trailhead.blocked");
  });

  it("emits trailhead.warn_high_risk when warn and risk >= threshold - 10", () => {
    const events = resolveTrailheadEventTypes(
      evaluation({ gateDecision: "warn", riskScore: 62, releaseReady: false }),
      { riskThreshold: 70 },
    );
    expect(events).toContain("trailhead.warn_high_risk");
  });

  it("does not emit warn_high_risk below cutoff", () => {
    const events = resolveTrailheadEventTypes(
      evaluation({ gateDecision: "warn", riskScore: 50, releaseReady: false }),
      { riskThreshold: 70 },
    );
    expect(events).not.toContain("trailhead.warn_high_risk");
  });

  it("emits trailhead.ready when releaseReady is true", () => {
    const events = resolveTrailheadEventTypes(evaluation({ releaseReady: true }));
    expect(events).toContain("trailhead.ready");
  });

  it("emits trailhead.loop_exceeded from remediation next_action", () => {
    const remediation = buildRemediation({
      evaluation: {
        id: "eval-1",
        riskFactors: [
          { type: "test_coverage", score: 80, detail: { missing_tests: ["src/x.ts"] } },
        ],
        gateDecision: "block",
        releaseReady: false,
      },
      loopRound: 3,
      maxLoopRounds: 3,
    });
    const events = resolveTrailheadEventTypes(
      evaluation({ gateDecision: "block", releaseReady: false, remediation }),
    );
    expect(events).toContain("trailhead.loop_exceeded");
  });

  it("emits trailhead.override_applied for label policy overrides", () => {
    const events = resolveTrailheadEventTypes(
      evaluation({
        gateDecision: "block",
        releaseReady: true,
        policyOverride: {
          source: "label",
          owner: "david",
          reason: "approved hotfix",
          linkedTicket: "override:pr#42",
          expiresAt: "2026-06-01T00:00:00.000Z",
          appliedAt: "2026-05-28T00:00:00.000Z",
          changes: { releaseReady: true },
          preOverrideDecision: "block",
          preOverrideReleaseReady: false,
        },
      }),
    );
    expect(events).toContain("trailhead.override_applied");
  });
});

describe("resolveWebhookDeliveries", () => {
  it("delivers legacy and semantic events independently", () => {
    const subscribed = parseWebhookEvents("block,trailhead.blocked,trailhead.ready");
    const deliveries = resolveWebhookDeliveries(
      evaluation({ gateDecision: "block", releaseReady: true }),
      subscribed,
    );
    expect(deliveries).toEqual([
      { event: "block", kind: "legacy" },
      { event: "trailhead.blocked", kind: "trailhead" },
      { event: "trailhead.ready", kind: "trailhead" },
    ]);
  });

  it("respects legacy-only default subscriptions", () => {
    const subscribed = parseWebhookEvents("warn,block");
    const deliveries = resolveWebhookDeliveries(
      evaluation({ gateDecision: "warn", riskScore: 80, releaseReady: false }),
      subscribed,
      { riskThreshold: 70 },
    );
    expect(deliveries).toEqual([{ event: "warn", kind: "legacy" }]);
  });
});
