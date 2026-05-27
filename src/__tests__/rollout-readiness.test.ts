import { describe, it, expect } from "vitest";
import { computeRolloutReadiness } from "../rollout-readiness.js";

describe("computeRolloutReadiness", () => {
  const base = {
    gateDecision: "allow" as const,
    riskScore: 20,
    healthScore: 100,
    gateMode: "release-ready" as const,
    releaseReady: true,
  };

  it("returns go band for clean release-ready evaluation", () => {
    const result = computeRolloutReadiness(base);
    expect(result.band).toBe("go");
    expect(result.ready).toBe(true);
  });

  it("cannot return go when required CI checks failed", () => {
    const result = computeRolloutReadiness({
      ...base,
      releaseReady: false,
      ci: { allRequiredPassed: false, failedCount: 1, pendingCount: 0 },
    });
    expect(result.band).not.toBe("go");
    expect(result.ready).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("CI check"))).toBe(true);
  });

  it("returns review or hold when CI is pending", () => {
    const result = computeRolloutReadiness({
      ...base,
      ci: { allRequiredPassed: false, failedCount: 0, pendingCount: 2 },
    });
    expect(result.band).not.toBe("go");
  });
});
