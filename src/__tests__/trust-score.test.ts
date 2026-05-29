import { describe, expect, it } from "vitest";
import { computeAgentTrustScore, strictnessFromTrust } from "../trust-score.js";

describe("trust-score", () => {
  it("assigns fast-track for high release-ready rate", () => {
    const trust = computeAgentTrustScore({
      evaluations: 20,
      releaseReadyCount: 20,
      revertCount: 0,
      humanReviewRequiredCount: 0,
      policyViolationCount: 0,
      sensitivePathViolationCount: 0,
      remediationRoundsToReady: [1, 1, 1, 1],
    });
    expect(trust.profile).toBe("fast-track");
    expect(trust.score).toBeGreaterThanOrEqual(0.85);
    expect(trust.thresholdDelta).toBe(10);
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
    expect(trust.profile).toBe("probation");
    expect(trust.autofixEnabled).toBe(false);
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
    const profile = strictnessFromTrust(trust, 30);
    expect(profile.strictness).toBe("strict");
    expect(profile.profile).toBe("probation");
  });
});
