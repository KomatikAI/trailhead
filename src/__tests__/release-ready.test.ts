import { describe, it, expect } from "vitest";
import {
  computeReleaseReady,
  shouldBlockMerge,
  checkConclusionForEvaluation,
  resolveCheckName,
} from "../release-ready.js";
import type { GateEvaluation } from "../types.js";

describe("computeReleaseReady", () => {
  it("passes when CI and risk are clear in release-ready mode", () => {
    const result = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "allow",
      riskScore: 40,
      riskThreshold: 70,
      healthScore: 100,
      healthChecksConfigured: false,
      ciSummary: {
        checks: [],
        allRequiredPassed: true,
        pendingCount: 0,
        failedCount: 0,
        missingCount: 0,
      },
      freezeActive: false,
    });
    expect(result.releaseReady).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("does NOT block on low health_score (GATE-3: warn-only)", () => {
    const result = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "allow",
      riskScore: 40,
      riskThreshold: 70,
      healthScore: 20,
      healthChecksConfigured: true,
      ciSummary: {
        checks: [],
        allRequiredPassed: true,
        pendingCount: 0,
        failedCount: 0,
        missingCount: 0,
      },
      freezeActive: false,
    });
    expect(result.releaseReady).toBe(true);
    expect(result.reasons.some((r) => /health/i.test(r))).toBe(false);
  });

  it("fails when required CI check failed", () => {
    const result = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "allow",
      riskScore: 40,
      riskThreshold: 70,
      healthScore: 100,
      healthChecksConfigured: false,
      ciSummary: {
        checks: [{ name: "Build", status: "fail", required: true }],
        allRequiredPassed: false,
        pendingCount: 0,
        failedCount: 1,
        missingCount: 0,
      },
      freezeActive: false,
    });
    expect(result.releaseReady).toBe(false);
    expect(result.reasons.some((r) => r.includes("Build"))).toBe(true);
  });

  it("risk-only mode ignores CI", () => {
    const result = computeReleaseReady({
      gateMode: "risk-only",
      gateDecision: "allow",
      riskScore: 40,
      riskThreshold: 70,
      healthScore: 100,
      healthChecksConfigured: false,
      ciSummary: null,
      freezeActive: false,
    });
    expect(result.releaseReady).toBe(true);
  });

  it("blocks on freeze window", () => {
    const result = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "allow",
      riskScore: 10,
      riskThreshold: 70,
      healthScore: 100,
      healthChecksConfigured: false,
      ciSummary: null,
      freezeActive: true,
      freezeMessage: "Friday freeze",
    });
    expect(result.releaseReady).toBe(false);
    expect(result.reasons[0]).toContain("Friday freeze");
  });
});

describe("shouldBlockMerge", () => {
  const base: GateEvaluation = {
    id: "test",
    repoId: "o/r",
    commitSha: "abc",
    healthScore: 100,
    riskScore: 50,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 1,
  };

  it("never blocks in advisory mode", () => {
    expect(shouldBlockMerge({ ...base, gateMode: "advisory", releaseReady: false })).toBe(
      false,
    );
  });

  it("blocks on releaseReady false in release-ready mode", () => {
    expect(
      shouldBlockMerge({ ...base, gateMode: "release-ready", releaseReady: false }),
    ).toBe(true);
  });

  it("blocks on gateDecision block in risk-only mode", () => {
    expect(
      shouldBlockMerge({ ...base, gateMode: "risk-only", gateDecision: "block" }),
    ).toBe(true);
  });
});

describe("checkConclusionForEvaluation", () => {
  const base: GateEvaluation = {
    id: "test",
    repoId: "o/r",
    commitSha: "abc",
    healthScore: 100,
    riskScore: 50,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 1,
  };

  it("returns neutral for advisory mode", () => {
    expect(
      checkConclusionForEvaluation({
        ...base,
        gateMode: "advisory",
        releaseReady: false,
        gateDecision: "block",
      }),
    ).toBe("neutral");
  });

  it("returns failure when not release ready", () => {
    expect(
      checkConclusionForEvaluation({
        ...base,
        gateMode: "release-ready",
        releaseReady: false,
        gateDecision: "allow",
      }),
    ).toBe("failure");
  });

  it.each([
    { decision: "allow" as const, conclusion: "success" },
    { decision: "block" as const, conclusion: "failure" },
  ])(
    "publishes cannot-evaluate availability as $conclusion even in advisory mode",
    ({ decision, conclusion }) => {
      expect(
        checkConclusionForEvaluation({
          ...base,
          gateMode: "advisory",
          releaseReady: decision === "allow",
          gateDecision: decision,
          releaseBrief: {
            verdict: "cannot_evaluate",
            findings: [],
            inputs: [],
            actions: [],
            override: null,
          },
        }),
      ).toBe(conclusion);
    },
  );
});

describe("resolveCheckName", () => {
  it("uses legacy name for risk-only", () => {
    expect(resolveCheckName("risk-only")).toBe("Trailhead");
  });

  it("uses release ready name by default", () => {
    expect(resolveCheckName("release-ready")).toBe("Trailhead — Release Ready");
  });

  it("honors a custom name in risk-only mode", () => {
    expect(resolveCheckName("risk-only", "Custom Risk Gate")).toBe("Custom Risk Gate");
  });
});
