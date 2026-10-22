import { describe, it, expect } from "vitest";
import {
  hasOverrideLabel,
  parseOverrideComment,
  resolveLabelOverride,
  buildLabelOverrideAudit,
  applyLabelOverrideToEvaluation,
  partitionOverrideReasons,
  formatOverrideRejectionMessage,
} from "../override.js";
import { computeReleaseReady } from "../release-ready.js";
import type { CiSummary, GateEvaluation, PolicyOverrideAudit } from "../types.js";

describe("hasOverrideLabel", () => {
  it("matches trailhead-override case-insensitively", () => {
    expect(hasOverrideLabel(["Trailhead-Override"])).toBe(true);
    expect(hasOverrideLabel(["bug"])).toBe(false);
  });
});

describe("parseOverrideComment", () => {
  it("extracts the most recent valid override reason", () => {
    expect(
      parseOverrideComment([
        { body: "trailhead-override: first reason", author: "alice" },
        { body: "Looks good to me", author: "bob" },
        { body: "trailhead-override: latest reason", author: "carol" },
      ]),
    ).toEqual({
      reason: "latest reason",
      author: "carol",
    });
  });

  it("accepts leading whitespace on the override line", () => {
    expect(
      parseOverrideComment([
        {
          body: "  trailhead-override: emergency hotfix for prod outage",
          author: "david",
        },
      ]),
    ).toEqual({
      reason: "emergency hotfix for prod outage",
      author: "david",
    });
  });

  it("returns null when label comment is missing or empty", () => {
    expect(
      parseOverrideComment([{ body: "trailhead-override:", author: "alice" }]),
    ).toBeNull();
    expect(
      parseOverrideComment([{ body: "please override this", author: "alice" }]),
    ).toBeNull();
  });
});

describe("resolveLabelOverride", () => {
  const blockedRelease = {
    releaseReady: false,
    reasons: ["Risk/policy gate decision is BLOCK"],
  };

  it("applies override when label and reason are present", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: approved by on-call", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 1,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.audit.source).toBe("label");
    expect(outcome.audit.reason).toBe("approved by on-call");
    expect(outcome.audit.changes.releaseReady).toBe(true);
    expect(outcome.audit.preOverrideDecision).toBe("block");
  });

  it("rejects when reason comment is missing", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 0,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome).toEqual({
      kind: "rejected",
      code: "missing_reason",
      message: formatOverrideRejectionMessage("missing_reason"),
    });
  });

  it("gives an exact recovery action when label overrides are disabled", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: approved", author: "david" }],
      config: { enabled: false, maxPerWeek: 3 },
      recentOverrideCount: 0,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome).toEqual({
      kind: "rejected",
      code: "disabled",
      message: formatOverrideRejectionMessage("disabled"),
    });
    if (outcome.kind !== "rejected") return;
    expect(outcome.message).toContain("Remove the label");
    expect(outcome.message).toContain("enable the policy");
  });

  it("treats a retained reason without the label as inactive/revoked", () => {
    const outcome = resolveLabelOverride({
      labels: ["release"],
      comments: [{ body: "trailhead-override: approved", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 0,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome).toEqual({
      kind: "revoked",
      message: expect.stringContaining("no override is active"),
    });
    if (outcome.kind !== "revoked") return;
    expect(outcome.message).toContain("Add the label only if you intend to authorize");
  });

  it("rejects when weekly cap is exceeded", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: one more", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 5,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.code).toBe("cap_exceeded");
    expect(outcome.message).toContain("Remove the label");
  });

  it("names stale override intent when release is already ready", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: unnecessary", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 0,
      releaseResult: { releaseReady: true, reasons: [] },
      gateDecision: "allow",
      prNumber: 42,
    });

    expect(outcome).toEqual({
      kind: "rejected",
      code: "not_needed",
      message: formatOverrideRejectionMessage("not_needed"),
    });
  });
});

describe("buildLabelOverrideAudit", () => {
  it("captures pre-override state for audit trail", () => {
    const audit = buildLabelOverrideAudit({
      parsed: { reason: "hotfix", author: "david" },
      prNumber: 99,
      releaseResult: { releaseReady: false, reasons: ["CI failed"] },
      gateDecision: "block",
    });

    expect(audit.owner).toBe("david");
    expect(audit.linkedTicket).toBe("override:pr#99");
    expect(audit.preOverrideReleaseReady).toBe(false);
    expect(audit.preOverrideReasons).toEqual(["CI failed"]);
  });
});

// ---------------------------------------------------------------------------
// ADR-011 §3 — scoped override
// ---------------------------------------------------------------------------

const RED_CI: CiSummary = {
  checks: [
    { name: "type-check", status: "fail", required: true },
    { name: "lint", status: "pass", required: true },
    { name: "vercel-preview", status: "fail", required: false },
  ],
  allRequiredPassed: false,
  pendingCount: 0,
  failedCount: 2,
  missingCount: 0,
};

const GREEN_CI: CiSummary = {
  checks: [
    { name: "type-check", status: "pass", required: true },
    { name: "lint", status: "pass", required: true },
  ],
  allRequiredPassed: true,
  pendingCount: 0,
  failedCount: 0,
  missingCount: 0,
};

function evaluationWith(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "eval-1",
    repoId: "KomatikAI/trailhead",
    commitSha: "abc123",
    prNumber: 4033,
    healthScore: 90,
    riskScore: 90,
    gateDecision: "block",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 12,
    gateMode: "release-ready",
    releaseReady: false,
    ...overrides,
  };
}

function auditWith(overrides: Partial<PolicyOverrideAudit> = {}): PolicyOverrideAudit {
  return {
    source: "label",
    owner: "david",
    reason: "reviewed and accepted",
    linkedTicket: "override:pr#4033",
    expiresAt: "2026-08-16T00:00:00.000Z",
    appliedAt: "2026-08-09T00:00:00.000Z",
    changes: { releaseReady: true },
    ...overrides,
  };
}

describe("partitionOverrideReasons", () => {
  it("retains reasons naming a red required check and overrides the rest", () => {
    const { overridden, retained } = partitionOverrideReasons(
      [
        'Required CI check "type-check" is FAIL',
        "Risk score 90 exceeds threshold 70",
        "Risk/policy gate decision is BLOCK",
      ],
      RED_CI,
    );

    expect(retained).toEqual(['Required CI check "type-check" is FAIL']);
    expect(overridden).toEqual([
      "Risk score 90 exceeds threshold 70",
      "Risk/policy gate decision is BLOCK",
    ]);
  });

  it("retains pending required checks", () => {
    const { retained } = partitionOverrideReasons(
      ["2 required CI check(s) still pending"],
      { ...GREEN_CI, pendingCount: 2, allRequiredPassed: false },
    );
    expect(retained).toEqual(["2 required CI check(s) still pending"]);
  });

  it("fails closed on CI-shaped reasons when no CI summary is available", () => {
    const { overridden, retained } = partitionOverrideReasons([
      'Required CI check "deploy" is MISSING',
      "Release freeze active",
    ]);

    expect(retained).toEqual(['Required CI check "deploy" is MISSING']);
    expect(overridden).toEqual(["Release freeze active"]);
  });

  it("does not retain a CI reason for a check that is green", () => {
    const { overridden, retained } = partitionOverrideReasons(
      ["Security gate requires clearance — blocking alerts present"],
      RED_CI,
    );
    expect(retained).toEqual([]);
    expect(overridden).toHaveLength(1);
  });
});

describe("scoped override — full (default)", () => {
  it("defaults the audit scope to full and clears everything", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: approved by on-call", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 0,
      releaseResult: {
        releaseReady: false,
        reasons: ['Required CI check "type-check" is FAIL'],
      },
      gateDecision: "block",
      prNumber: 4033,
      ci: RED_CI,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.audit.scope).toBe("full");
    expect(outcome.audit.changes.releaseReady).toBe(true);
    expect(outcome.audit.retainedReasons).toBeUndefined();

    const applied = applyLabelOverrideToEvaluation(
      evaluationWith({
        ci: RED_CI,
        releaseReadyReasons: ['Required CI check "type-check" is FAIL'],
      }),
      outcome.audit,
    );

    expect(applied.releaseReady).toBe(true);
    expect(applied.releaseReadyReasons).toBeUndefined();
    expect(applied.policyOverride).toBe(outcome.audit);
  });

  it("treats a pre-ADR-011 audit with no scope as a full override", () => {
    const applied = applyLabelOverrideToEvaluation(
      evaluationWith({
        ci: RED_CI,
        releaseReadyReasons: ['Required CI check "type-check" is FAIL'],
      }),
      auditWith(),
    );

    expect(applied.releaseReady).toBe(true);
    expect(applied.releaseReadyReasons).toBeUndefined();
  });
});

describe("scoped override — risk_only", () => {
  it("carries the scope onto the audit", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [
        { body: "trailhead-override: keystone-verified train", author: "david" },
      ],
      config: { enabled: true, maxPerWeek: 5, scope: "risk_only" },
      recentOverrideCount: 0,
      releaseResult: {
        releaseReady: false,
        reasons: ["Risk score 90 exceeds threshold 70"],
      },
      gateDecision: "block",
      prNumber: 4033,
      ci: GREEN_CI,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.audit.scope).toBe("risk_only");
    expect(outcome.audit.reason).toBe("keystone-verified train");
  });

  it("leaves a red required check blocking (ADR-011 §3: red tests stay red)", () => {
    const releaseResult = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "block",
      riskScore: 90,
      riskThreshold: 70,
      healthScore: 95,
      healthChecksConfigured: true,
      ciSummary: RED_CI,
      freezeActive: false,
    });
    expect(releaseResult.releaseReady).toBe(false);

    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: accepted risk", author: "david" }],
      config: { enabled: true, maxPerWeek: 5, scope: "risk_only" },
      recentOverrideCount: 0,
      releaseResult,
      gateDecision: "block",
      prNumber: 4033,
      ci: RED_CI,
    });
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;

    const applied = applyLabelOverrideToEvaluation(
      evaluationWith({ ci: RED_CI, releaseReadyReasons: releaseResult.reasons }),
      outcome.audit,
    );

    expect(applied.releaseReady).toBe(false);
    expect(applied.releaseReadyReasons).toEqual([
      'Required CI check "type-check" is FAIL',
    ]);
    expect(applied.policyOverride?.retainedReasons).toEqual([
      'Required CI check "type-check" is FAIL',
    ]);
    expect(applied.policyOverride?.overriddenReasons).toEqual([
      "Risk/policy gate decision is BLOCK",
      "Risk score 90 exceeds threshold 70",
    ]);
    expect(applied.policyOverride?.changes.releaseReady).toBeUndefined();
    expect(applied.policyOverride?.scope).toBe("risk_only");
    expect(applied.policyOverride?.preOverrideReleaseReady).toBe(false);
  });

  it("clears a risk-over-threshold-only block", () => {
    const releaseResult = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "warn",
      riskScore: 90,
      riskThreshold: 70,
      healthScore: 95,
      healthChecksConfigured: true,
      ciSummary: GREEN_CI,
      freezeActive: false,
    });
    expect(releaseResult.reasons).toEqual(["Risk score 90 exceeds threshold 70"]);

    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: promotion-shaped risk", author: "david" }],
      config: { enabled: true, maxPerWeek: 5, scope: "risk_only" },
      recentOverrideCount: 0,
      releaseResult,
      gateDecision: "warn",
      prNumber: 4033,
      ci: GREEN_CI,
    });
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;

    const applied = applyLabelOverrideToEvaluation(
      evaluationWith({
        ci: GREEN_CI,
        gateDecision: "warn",
        releaseReadyReasons: releaseResult.reasons,
      }),
      outcome.audit,
    );

    expect(applied.releaseReady).toBe(true);
    expect(applied.releaseReadyReasons).toBeUndefined();
    expect(applied.policyOverride?.changes.releaseReady).toBe(true);
    expect(applied.policyOverride?.retainedReasons).toBeUndefined();
    expect(applied.policyOverride?.overriddenReasons).toEqual([
      "Risk score 90 exceeds threshold 70",
    ]);
  });

  it("clears policy-finding-driven blocking", () => {
    const releaseResult = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "block",
      riskScore: 10,
      riskThreshold: 70,
      healthScore: 95,
      healthChecksConfigured: true,
      ciSummary: GREEN_CI,
      freezeActive: false,
      policyFindings: ["CI integrity blocking patterns detected (4)"],
    });

    const applied = applyLabelOverrideToEvaluation(
      evaluationWith({
        ci: GREEN_CI,
        releaseReadyReasons: releaseResult.reasons,
      }),
      buildLabelOverrideAudit({
        parsed: { reason: "patterns reviewed", author: "david" },
        prNumber: 4033,
        releaseResult,
        gateDecision: "block",
        scope: "risk_only",
        ci: GREEN_CI,
      }),
    );

    expect(applied.releaseReady).toBe(true);
    expect(applied.policyOverride?.overriddenReasons).toContain(
      "CI integrity blocking patterns detected (4)",
    );
  });

  it("keeps pending required checks blocking", () => {
    const pendingCi: CiSummary = {
      ...GREEN_CI,
      allRequiredPassed: false,
      pendingCount: 1,
    };
    const releaseResult = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "block",
      riskScore: 90,
      riskThreshold: 70,
      healthScore: 95,
      healthChecksConfigured: true,
      ciSummary: pendingCi,
      freezeActive: false,
    });

    const applied = applyLabelOverrideToEvaluation(
      evaluationWith({ ci: pendingCi, releaseReadyReasons: releaseResult.reasons }),
      buildLabelOverrideAudit({
        parsed: { reason: "accepted risk", author: "david" },
        prNumber: 4033,
        releaseResult,
        gateDecision: "block",
        scope: "risk_only",
        ci: pendingCi,
      }),
    );

    expect(applied.releaseReady).toBe(false);
    expect(applied.releaseReadyReasons).toEqual(["1 required CI check(s) still pending"]);
  });

  it("re-partitions against the evaluation CI when the audit was built without one", () => {
    const audit = buildLabelOverrideAudit({
      parsed: { reason: "accepted risk", author: "david" },
      prNumber: 4033,
      releaseResult: {
        releaseReady: false,
        reasons: [
          'Required CI check "type-check" is FAIL',
          "Risk score 90 exceeds threshold 70",
        ],
      },
      gateDecision: "block",
      scope: "risk_only",
    });
    expect(audit.retainedReasons).toEqual(['Required CI check "type-check" is FAIL']);

    const applied = applyLabelOverrideToEvaluation(evaluationWith({ ci: RED_CI }), audit);

    expect(applied.releaseReady).toBe(false);
    expect(applied.releaseReadyReasons).toEqual([
      'Required CI check "type-check" is FAIL',
    ]);
  });
});
