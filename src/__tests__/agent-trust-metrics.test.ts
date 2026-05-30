import { describe, expect, it } from "vitest";
import {
  AGENT_TRUST_METRICS_SCHEMA,
  assessColdStart,
  assessColdStartFromMetrics,
  computeScoreDistribution,
  parseAgentTrustMetrics,
} from "../agent-trust-metrics.js";

describe("agent-trust-metrics", () => {
  it("parses bare metrics JSON", () => {
    const metrics = parseAgentTrustMetrics(
      JSON.stringify({
        evaluations: 10,
        releaseReadyCount: 8,
        revertCount: 1,
        humanReviewRequiredCount: 2,
        policyViolationCount: 0,
        sensitivePathViolationCount: 0,
        remediationRoundsToReady: [1, 2],
      }),
    );
    expect(metrics?.evaluations).toBe(10);
    expect(metrics?.releaseReadyCount).toBe(8);
  });

  it("parses versioned envelope and returns inner trust", () => {
    const metrics = parseAgentTrustMetrics(
      JSON.stringify({
        schema: AGENT_TRUST_METRICS_SCHEMA,
        agent_id: "pixel",
        collected_at: "2026-05-29T00:00:00.000Z",
        window_days: 30,
        trust: {
          evaluations: 12,
          releaseReadyCount: 10,
          revertCount: 0,
          humanReviewRequiredCount: 1,
          policyViolationCount: 0,
          sensitivePathViolationCount: 0,
          remediationRoundsToReady: [],
          penaltyQuality: {
            mean: 0.8,
            stdDev: 1.1,
            cleanRate: 0.83,
            sampleCount: 12,
          },
        },
        cold_start: { emitTrust: true, reason: null },
      }),
    );
    expect(metrics?.penaltyQuality?.cleanRate).toBeCloseTo(0.83);
  });

  it("returns null for envelope with trust=null (cold start)", () => {
    const metrics = parseAgentTrustMetrics(
      JSON.stringify({
        schema: AGENT_TRUST_METRICS_SCHEMA,
        agent_id: "forge",
        collected_at: "2026-05-29T00:00:00.000Z",
        window_days: 30,
        trust: null,
        cold_start: {
          emitTrust: false,
          reason: "insufficient_evaluations (2 < 5)",
        },
      }),
    );
    expect(metrics).toBeNull();
  });

  it("blocks cold start on insufficient evaluations", () => {
    const result = assessColdStart({ evaluations: 2 });
    expect(result.emitTrust).toBe(false);
    expect(result.reason).toContain("insufficient_evaluations");
  });

  it("blocks cold start on flat allow-only signals", () => {
    const result = assessColdStartFromMetrics({
      evaluations: 20,
      releaseReadyCount: 20,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 0,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [1, 1],
    });
    expect(result.emitTrust).toBe(false);
    expect(result.reason).toContain("flat_signals");
  });

  it("allows cold start when penalty distribution has variance", () => {
    const result = assessColdStartFromMetrics({
      evaluations: 20,
      releaseReadyCount: 20,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 0,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [1, 1],
      penaltyQuality: {
        mean: 0.9,
        stdDev: 1.4,
        cleanRate: 1,
        sampleCount: 20,
      },
    });
    expect(result.emitTrust).toBe(true);
  });

  it("computes penalty score distribution", () => {
    const distribution = computeScoreDistribution([0, 0, 2, 4, 6], {
      minScoreStdDev: 1,
    });
    expect(distribution?.hasVariance).toBe(true);
    expect(distribution?.mean).toBeGreaterThan(0);
  });
});
