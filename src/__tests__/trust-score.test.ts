import { describe, expect, it } from "vitest";
import { computeAgentTrustScore, strictnessFromTrust } from "../trust-score.js";

const penaltyVariance = {
  mean: 0.6,
  stdDev: 1.2,
  cleanRate: 0.95,
  sampleCount: 20,
};

describe("trust-score", () => {
  it("returns null below minimum evidence", () => {
    const trust = computeAgentTrustScore({
      evaluations: 2,
      releaseReadyCount: 2,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 0,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [],
    });
    expect(trust).toBeNull();
  });

  it("returns null for flat perfect signals without penalty variance", () => {
    const trust = computeAgentTrustScore({
      evaluations: 20,
      releaseReadyCount: 20,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 0,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [1, 1, 1, 1],
    });
    expect(trust).toBeNull();
  });

  it("assigns fast-track for high release-ready rate", () => {
    const trust = computeAgentTrustScore({
      evaluations: 20,
      releaseReadyCount: 20,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 0,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [1, 1, 1, 1],
      penaltyQuality: penaltyVariance,
    });
    expect(trust?.profile).toBe("fast-track");
    expect(trust?.score).toBeGreaterThanOrEqual(0.85);
    expect(trust?.thresholdDelta).toBe(10);
    expect(trust?.factors.penalty_clean_rate).toBeCloseTo(0.95);
  });

  it("assigns probation for poor outcomes", () => {
    const trust = computeAgentTrustScore({
      evaluations: 10,
      releaseReadyCount: 2,
      revertCount: 4,
      humanReviewRequiredCount: 8,
      policyViolationCount: 3,
      sensitivePathViolationCount: 2,
      remediationRoundsToReady: [5, 4, 5],
    });
    expect(trust?.profile).toBe("probation");
    expect(trust?.autofixEnabled).toBe(false);
  });

  it("maps probation to strict trust profile", () => {
    const trust = computeAgentTrustScore({
      evaluations: 10,
      releaseReadyCount: 1,
      revertCount: 5,
      humanReviewRequiredCount: 9,
      policyViolationCount: 4,
      sensitivePathViolationCount: 3,
      remediationRoundsToReady: [],
    });
    expect(trust).not.toBeNull();
    const profile = strictnessFromTrust(trust, 30);
    expect(profile.strictness).toBe("strict");
    expect(profile.profile).toBe("probation");
  });

  it("uses penalty clean rate when present", () => {
    const trust = computeAgentTrustScore({
      evaluations: 10,
      releaseReadyCount: 0,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 1,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [],
      penaltyQuality: {
        mean: 0.4,
        stdDev: 1.5,
        cleanRate: 0.9,
        sampleCount: 10,
      },
    });
    expect(trust).not.toBeNull();
    expect(trust?.factors.release_ready_rate).toBeGreaterThanOrEqual(0.9);
  });
});
