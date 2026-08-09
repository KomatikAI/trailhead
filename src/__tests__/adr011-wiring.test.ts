import { describe, it, expect } from "vitest";

import {
  applyInputRelevance,
  buildReleaseBrief,
  enumerateDetectorFindings,
  formatGateReport,
} from "../gate.js";
import { computeReleaseReady, checkCountsTowardBlocking } from "../release-ready.js";
import {
  DEFAULT_ADVISORY_REASON,
  DEFAULT_BLOCKING_REASON,
  DEFAULT_SKIPPED_UPSTREAM_REASON,
} from "../input-relevance.js";
import { partitionOverrideReasons } from "../override.js";
import { collectConfigWarnings } from "../config-core.js";
import { parseRepoConfigContent } from "../config-core.js";
import type {
  CiCheck,
  CiSummary,
  GateEvaluation,
  InputRelevanceEntry,
} from "../types.js";

function check(overrides: Partial<CiCheck> & { name: string }): CiCheck {
  return {
    status: "pass",
    required: false,
    ...overrides,
  };
}

function summary(checks: CiCheck[]): CiSummary {
  const required = checks.filter((c) => c.required);
  return {
    checks,
    allRequiredPassed: required.every((c) => c.status === "pass" || c.status === "skip"),
    pendingCount: required.filter((c) => c.status === "pending").length,
    failedCount: required.filter(
      (c) => c.status === "fail" || c.status === "missing" || c.status === "stale",
    ).length,
    missingCount: required.filter((c) => c.status === "missing").length,
  };
}

function evaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "dg-test",
    repoId: "test-owner/test-repo",
    commitSha: "abc1234",
    healthScore: 100,
    riskScore: 30,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 1,
    gateMode: "release-ready",
    releaseReady: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// applyInputRelevance
// ---------------------------------------------------------------------------

describe("applyInputRelevance", () => {
  it("reproduces the pre-ADR-011 rollup byte-for-byte with no policy entries", () => {
    const before = summary([
      check({ name: "Build", status: "pass", required: true }),
      check({ name: "Tests", status: "fail", required: true }),
      check({ name: "Lint", status: "missing", required: true }),
      check({ name: "Docs", status: "pending", required: true }),
      check({ name: "Vercel", status: "fail", required: false }),
    ]);

    const after = applyInputRelevance(before, []);

    expect(after.allRequiredPassed).toBe(before.allRequiredPassed);
    expect(after.pendingCount).toBe(before.pendingCount);
    expect(after.failedCount).toBe(before.failedCount);
    expect(after.missingCount).toBe(before.missingCount);
    expect(after.checks.map((c) => c.name)).toEqual(before.checks.map((c) => c.name));
  });

  it("maps required to blocking and non-required to advisory by default", () => {
    const after = applyInputRelevance(
      summary([
        check({ name: "Build", status: "pass", required: true }),
        check({ name: "Vercel", status: "fail", required: false }),
      ]),
      [],
    );

    expect(after.checks[0].disposition).toEqual({
      kind: "blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
    expect(after.checks[1].disposition).toEqual({
      kind: "advisory",
      reason: DEFAULT_ADVISORY_REASON,
      source: "default",
    });
  });

  // ADR-011 §2 — a default-source `skip` is the workflow classifying itself out
  // (path filter, `if:` condition). Narration changes; the decision must not.
  it("reclassifies a default-source skip to irrelevant with zero outcome change", () => {
    const checks = [
      check({ name: "CI Gate", status: "pass", required: true }),
      check({ name: "web e2e", status: "skip", required: true }),
      check({ name: "web lint", status: "skip", required: false }),
    ];
    const before = summary(checks);
    const after = applyInputRelevance(before, []);

    expect(after.allRequiredPassed).toBe(before.allRequiredPassed);
    expect(after.failedCount).toBe(before.failedCount);
    expect(after.pendingCount).toBe(before.pendingCount);
    expect(after.missingCount).toBe(before.missingCount);
    expect(after.checks[1].disposition).toEqual({
      kind: "irrelevant",
      reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      source: "default",
    });

    const base = {
      gateMode: "release-ready" as const,
      gateDecision: "allow" as const,
      riskScore: 30,
      riskThreshold: 70,
      healthScore: 100,
      healthChecksConfigured: false,
      freezeActive: false,
    };
    const readyBefore = computeReleaseReady({ ...base, ciSummary: before });
    const readyAfter = computeReleaseReady({ ...base, ciSummary: after });
    expect(readyAfter).toEqual(readyBefore);
    expect(readyAfter.releaseReady).toBe(true);
  });

  // Promotion-zero correction (trailhead#350): a path-filtered check the seed
  // table marks blocking must self-describe, not render "skip | blocking | —".
  it("rewrites a policy-sourced blocking skip to irrelevant(skipped upstream)", () => {
    const after = applyInputRelevance(
      summary([check({ name: "web e2e", status: "skip", required: true })]),
      [{ pattern: "web *", disposition: "blocking", reason: "required on this pair" }],
    );

    expect(after.checks[0].disposition).toEqual({
      kind: "irrelevant",
      reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      source: "policy",
    });
    expect(after.allRequiredPassed).toBe(true);
  });

  it("derives missing_blocking for an absent required check", () => {
    const after = applyInputRelevance(
      summary([check({ name: "Build", status: "missing", required: true })]),
      [],
    );

    expect(after.checks[0].disposition?.kind).toBe("missing_blocking");
    expect(after.missingCount).toBe(1);
    expect(after.failedCount).toBe(1);
    expect(after.allRequiredPassed).toBe(false);
  });

  it("drops an irrelevant required failure out of the blocking rollup", () => {
    const entries: InputRelevanceEntry[] = [
      {
        pattern: "Deploy Edge Functions",
        disposition: "irrelevant",
        reason: "staging target unconfigured by design",
      },
    ];

    const after = applyInputRelevance(
      summary([
        check({ name: "Build", status: "pass", required: true }),
        check({ name: "Deploy Edge Functions", status: "fail", required: true }),
      ]),
      entries,
    );

    expect(after.allRequiredPassed).toBe(true);
    expect(after.failedCount).toBe(0);
    expect(after.checks[1].disposition).toEqual({
      kind: "irrelevant",
      reason: "staging target unconfigured by design",
      source: "policy",
    });
  });

  it("drops an advisory required failure out of the blocking rollup", () => {
    const after = applyInputRelevance(
      summary([check({ name: "Flaky suite", status: "fail", required: true })]),
      [{ pattern: "Flaky suite", disposition: "advisory" }],
    );

    expect(after.failedCount).toBe(0);
    expect(after.allRequiredPassed).toBe(true);
  });

  it("promotes a non-required check to blocking when policy says so", () => {
    const after = applyInputRelevance(
      summary([check({ name: "Security scan", status: "fail", required: false })]),
      [{ pattern: "Security scan", disposition: "blocking" }],
    );

    expect(after.failedCount).toBe(1);
    expect(after.allRequiredPassed).toBe(false);
  });

  it("excludes an irrelevant pending check from pendingCount", () => {
    const after = applyInputRelevance(
      summary([check({ name: "Preview deploy", status: "pending", required: true })]),
      [{ pattern: "Preview*", disposition: "irrelevant", reason: "not a gate input" }],
    );

    expect(after.pendingCount).toBe(0);
    expect(after.allRequiredPassed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeReleaseReady + dispositions (ADR-011 Case B)
// ---------------------------------------------------------------------------

describe("computeReleaseReady with dispositions", () => {
  const base = {
    gateMode: "release-ready" as const,
    gateDecision: "allow" as const,
    riskScore: 30,
    riskThreshold: 70,
    healthScore: 100,
    healthChecksConfigured: false,
    freezeActive: false,
  };

  it("Case B: a required fail dispositioned irrelevant no longer blocks", () => {
    const ciSummary = applyInputRelevance(
      summary([
        check({ name: "CI Gate", status: "pass", required: true }),
        check({ name: "Deploy Edge Functions", status: "fail", required: true }),
      ]),
      [
        {
          pattern: "Deploy Edge Functions",
          disposition: "irrelevant",
          reason: "staging target unconfigured by design",
        },
      ],
    );

    const result = computeReleaseReady({ ...base, ciSummary });

    expect(result.releaseReady).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("still blocks the same input when no policy entry matches", () => {
    const ciSummary = applyInputRelevance(
      summary([check({ name: "Deploy Edge Functions", status: "fail", required: true })]),
      [],
    );

    const result = computeReleaseReady({ ...base, ciSummary });

    expect(result.releaseReady).toBe(false);
    expect(result.reasons).toEqual(['Required CI check "Deploy Edge Functions" is FAIL']);
  });

  it("missing_blocking still produces the reason it produces today", () => {
    const ciSummary = applyInputRelevance(
      summary([check({ name: "Playwright", status: "missing", required: true })]),
      [],
    );

    const result = computeReleaseReady({ ...base, ciSummary });

    expect(ciSummary.checks[0].disposition?.kind).toBe("missing_blocking");
    expect(result.reasons).toEqual(['Required CI check "Playwright" is MISSING']);
  });

  it("advisory failures produce no blocking reason", () => {
    const ciSummary = applyInputRelevance(
      summary([check({ name: "Bundle size", status: "fail", required: true })]),
      [{ pattern: "Bundle size", disposition: "advisory" }],
    );

    expect(computeReleaseReady({ ...base, ciSummary }).releaseReady).toBe(true);
  });
});

describe("checkCountsTowardBlocking", () => {
  it("falls back to required when no disposition is attached", () => {
    expect(checkCountsTowardBlocking(check({ name: "A", required: true }))).toBe(true);
    expect(checkCountsTowardBlocking(check({ name: "B", required: false }))).toBe(false);
  });

  it("prefers the disposition over the required flag in both directions", () => {
    expect(
      checkCountsTowardBlocking(
        check({
          name: "A",
          required: true,
          disposition: { kind: "irrelevant", reason: "x", source: "policy" },
        }),
      ),
    ).toBe(false);
    expect(
      checkCountsTowardBlocking(
        check({
          name: "B",
          required: false,
          disposition: { kind: "blocking", source: "policy" },
        }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// risk_only override composition (ADR-011 §3 x §2)
// ---------------------------------------------------------------------------

describe("risk_only override composes with dispositions", () => {
  it("retains reasons from checks whose disposition counts toward blocking", () => {
    const ciSummary = applyInputRelevance(
      summary([check({ name: "Security scan", status: "fail", required: false })]),
      [{ pattern: "Security scan", disposition: "blocking" }],
    );

    const { overridden, retained } = partitionOverrideReasons(
      ['Required CI check "Security scan" is FAIL', "Risk score 90 exceeds threshold 70"],
      ciSummary,
    );

    expect(retained).toEqual(['Required CI check "Security scan" is FAIL']);
    expect(overridden).toEqual(["Risk score 90 exceeds threshold 70"]);
  });

  it("has nothing to retain once an input is dispositioned irrelevant", () => {
    const ciSummary = applyInputRelevance(
      summary([check({ name: "Deploy Edge Functions", status: "fail", required: true })]),
      [
        {
          pattern: "Deploy Edge Functions",
          disposition: "irrelevant",
          reason: "unconfigured by design",
        },
      ],
    );

    // computeReleaseReady never emits a reason for it, so the override has only
    // risk/policy reasons left to clear.
    const reasons = computeReleaseReady({
      gateMode: "release-ready",
      gateDecision: "block",
      riskScore: 90,
      riskThreshold: 70,
      healthScore: 100,
      healthChecksConfigured: false,
      freezeActive: false,
      ciSummary,
    }).reasons;

    const { retained } = partitionOverrideReasons(reasons, ciSummary);
    expect(retained).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// enumerateDetectorFindings (ADR-011 Case A)
// ---------------------------------------------------------------------------

describe("enumerateDetectorFindings", () => {
  it("gives every pattern a stable id, title and file evidence", () => {
    const findings = enumerateDetectorFindings(
      "ci_integrity",
      [
        '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
        '.github/workflows/ci.yml: introduced "continue-on-error: true"',
      ],
      "blocking",
    );

    expect(findings).toEqual([
      {
        id: "ci_integrity/1",
        title: 'workflow bypass pattern "|| true"',
        severity: "blocking",
        evidence: ".github/workflows/ci.yml",
      },
      {
        id: "ci_integrity/2",
        title: 'introduced "continue-on-error: true"',
        severity: "blocking",
        evidence: ".github/workflows/ci.yml",
      },
    ]);
  });

  it("keeps prose messages whole rather than inventing evidence", () => {
    const findings = enumerateDetectorFindings(
      "pr_scope",
      ["PR scope exceeds max_files (40 > 20)."],
      "advisory",
    );

    expect(findings).toEqual([
      {
        id: "pr_scope/1",
        title: "PR scope exceeds max_files (40 > 20).",
        severity: "advisory",
      },
    ]);
  });

  it("returns nothing for an empty detector", () => {
    expect(enumerateDetectorFindings("supply_chain", [], "warn")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildReleaseBrief
// ---------------------------------------------------------------------------

describe("buildReleaseBrief", () => {
  it("maps releaseReady=false to a block verdict with top movers", () => {
    const brief = buildReleaseBrief(
      evaluation({
        releaseReady: false,
        gateDecision: "block",
        riskScore: 90,
        riskFactors: [
          { type: "ci_integrity", score: 40 },
          { type: "code_churn", score: 25 },
          { type: "file_count", score: 10 },
          { type: "author_history", score: 5 },
          { type: "pr_age", score: 0 },
        ],
      }),
      70,
    );

    expect(brief.verdict).toBe("block");
    expect(brief.riskScore).toBe(90);
    expect(brief.riskThreshold).toBe(70);
    expect(brief.topMovers).toEqual([
      { factor: "ci_integrity", score: 40 },
      { factor: "code_churn", score: 25 },
      { factor: "file_count", score: 10 },
    ]);
  });

  it("maps a warn gate decision on a ready release to warn", () => {
    expect(buildReleaseBrief(evaluation({ gateDecision: "warn" }), 70).verdict).toBe(
      "warn",
    );
  });

  it("uses the raw gate decision in risk-only mode", () => {
    const brief = buildReleaseBrief(
      evaluation({ gateMode: "risk-only", gateDecision: "block", releaseReady: true }),
      70,
    );
    expect(brief.verdict).toBe("block");
  });

  it("renders a cannot_evaluate verdict when a reason is supplied", () => {
    const brief = buildReleaseBrief(evaluation(), 70, "evaluation store unreachable");
    expect(brief.verdict).toBe("cannot_evaluate");
    expect(brief.cannotEvaluateReason).toBe("evaluation store unreachable");
  });

  it("lists every input, including the ones that did not count, each with a reason", () => {
    const ciSummary = applyInputRelevance(
      summary([
        check({ name: "CI Gate", status: "pass", required: true }),
        check({ name: "Deploy Edge Functions", status: "fail", required: true }),
        check({ name: "Vercel", status: "fail", required: false }),
        check({ name: "web e2e", status: "skip", required: true }),
      ]),
      [
        {
          pattern: "Deploy Edge Functions",
          disposition: "irrelevant",
          reason: "staging target unconfigured by design",
        },
      ],
    );

    const brief = buildReleaseBrief(evaluation({ ci: ciSummary }), 70);

    expect(brief.inputs).toEqual([
      {
        checkName: "CI Gate",
        status: "pass",
        disposition: "blocking",
        reason: DEFAULT_BLOCKING_REASON,
      },
      {
        checkName: "Deploy Edge Functions",
        status: "fail",
        disposition: "irrelevant",
        reason: "staging target unconfigured by design",
      },
      {
        checkName: "Vercel",
        status: "fail",
        disposition: "advisory",
        reason: DEFAULT_ADVISORY_REASON,
      },
      {
        checkName: "web e2e",
        status: "skip",
        disposition: "irrelevant",
        reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      },
    ]);
    // The audited briefs rendered every row as "advisory / —".
    expect(brief.inputs.every((input) => (input.reason ?? "").trim() !== "")).toBe(true);
  });

  it("fills the reason column for a summary that never met the disposition engine", () => {
    // Pre-ADR-011 stored evaluations (and externally-built summaries) carry no
    // disposition; re-rendering them must not reintroduce blank reason cells.
    const brief = buildReleaseBrief(
      evaluation({
        ci: summary([
          check({ name: "CI Gate", status: "fail", required: true }),
          check({ name: "Vercel", status: "fail", required: false }),
        ]),
      }),
      70,
    );

    expect(brief.inputs).toEqual([
      {
        checkName: "CI Gate",
        status: "fail",
        disposition: "blocking",
        reason: DEFAULT_BLOCKING_REASON,
      },
      {
        checkName: "Vercel",
        status: "fail",
        disposition: "advisory",
        reason: DEFAULT_ADVISORY_REASON,
      },
    ]);
  });

  it("derives fix, wait and override actions", () => {
    const ciSummary = applyInputRelevance(
      summary([
        check({
          name: "Tests",
          status: "fail",
          required: true,
          detailsUrl: "https://example.com/checks/1",
        }),
        check({ name: "Playwright", status: "pending", required: true }),
      ]),
      [],
    );

    const brief = buildReleaseBrief(
      evaluation({
        releaseReady: false,
        gateDecision: "block",
        riskScore: 90,
        ci: ciSummary,
        enumeratedFindings: [
          { id: "ci_integrity/1", title: "bypass added", severity: "blocking" },
          { id: "supply_chain_warning/1", title: "new dependency", severity: "warn" },
        ],
      }),
      70,
    );

    expect(brief.actions).toEqual([
      expect.objectContaining({ kind: "fix", link: "https://example.com/checks/1" }),
      expect.objectContaining({ kind: "fix", detail: "bypass added (`ci_integrity/1`)" }),
      expect.objectContaining({ kind: "wait" }),
      expect.objectContaining({ kind: "override" }),
    ]);
  });

  it("omits the override action once an override is already recorded", () => {
    const brief = buildReleaseBrief(
      evaluation({
        riskScore: 90,
        releaseReady: false,
        policyOverride: {
          source: "label",
          owner: "david",
          reason: "keystone-verified promotion train",
          linkedTicket: "override:pr#4033",
          expiresAt: "2026-08-16T00:00:00.000Z",
          appliedAt: "2026-08-09T00:00:00.000Z",
          scope: "risk_only",
          changes: {},
        },
      }),
      70,
    );

    expect(brief.actions.some((action) => action.kind === "override")).toBe(false);
    expect(brief.override).toEqual({
      by: "david",
      at: "2026-08-09T00:00:00.000Z",
      scope: "risk_only",
      rationale: "keystone-verified promotion train",
    });
  });

  it("reports override as null when there is none", () => {
    expect(buildReleaseBrief(evaluation(), 70).override).toBeNull();
  });

  it("renders a delta only once a previous evaluation exists", () => {
    expect(buildReleaseBrief(evaluation(), 70).delta).toBeUndefined();

    const brief = buildReleaseBrief(
      evaluation({
        remediation: {
          schema: "trailhead.remediation.v1",
          release_ready: false,
          fixes: [],
          blocking_count: 0,
          warn_count: 0,
          advisory_count: 0,
          autofix_eligible_count: 0,
          loop_round: 2,
          max_loop_rounds: 3,
          previous_evaluation_id: "dg-prev",
          fixes_resolved: ["ci_fail"],
          fixes_introduced: [],
          next_action: "fix_and_retry",
        },
      }),
      70,
    );

    expect(brief.delta).toBe("round 2 vs previous evaluation — resolved: ci_fail");
  });
});

// ---------------------------------------------------------------------------
// formatGateReport leads with the brief
// ---------------------------------------------------------------------------

describe("formatGateReport with a Release Brief", () => {
  function blockedEvaluation(riskThreshold: number): GateEvaluation {
    const evaluated = evaluation({
      releaseReady: false,
      gateDecision: "block",
      riskScore: 53,
      sizeScore: 61,
      healthChecks: [
        { target: "https://api.example.com/health", status: "warn", latencyMs: 200 },
      ],
      ci: applyInputRelevance(
        summary([
          check({ name: "CI Gate", status: "pass", required: true }),
          check({ name: "web e2e", status: "skip", required: true }),
        ]),
        [],
      ),
      enumeratedFindings: [
        {
          id: "agent_policy/1",
          title: "Agent PR risk threshold tightened from 70 to 50",
          severity: "warn",
        },
      ],
      policyFindings: ["Agent PR risk threshold tightened from 70 to 50."],
    });
    evaluated.releaseBrief = buildReleaseBrief(evaluated, riskThreshold);
    return evaluated;
  }

  it("puts the brief first and keeps the existing report below it", () => {
    const evaluated = blockedEvaluation(70);

    const report = formatGateReport(evaluated, 70);

    expect(report.indexOf("## Release Brief")).toBe(0);
    expect(report.indexOf("## Release Brief")).toBeLessThan(
      report.indexOf("Trailhead — NOT RELEASE READY"),
    );
    // Case A: the finding itself, not just the count.
    expect(report).toContain("Agent PR risk threshold tightened from 70 to 50");
    expect(report).toContain("`agent_policy/1`");
    // Sections the brief does not carry stay put.
    expect(report).toContain("| Size / blast radius | 61/100 (reported separately) |");
    expect(report).toContain("| Health |");
    expect(report).toContain("Health Checks");
  });

  // Audit item 2: one comment said "risk 53 (threshold 50)" in the brief and
  // "Risk 53/100 (threshold 70)" in the legacy table below it.
  it("never renders a threshold the brief did not judge against", () => {
    // 50 = the effective threshold (agent-PR policy tightened it); 70 = the base
    // action input the caller still passes.
    const report = formatGateReport(blockedEvaluation(50), 70);

    expect(report).toContain("risk 53 (threshold 50)");
    expect(report).not.toMatch(/threshold:? 70\b/);
  });

  it("carries the effective threshold into the risk-only score bar", () => {
    const evaluated = evaluation({
      gateMode: "risk-only",
      gateDecision: "block",
      riskScore: 53,
    });
    evaluated.releaseBrief = buildReleaseBrief(evaluated, 50);

    const report = formatGateReport(evaluated, 70);

    expect(report).toContain("53/100 (threshold: 50)");
    expect(report).not.toMatch(/threshold:? 70\b/);
  });

  it("retires the legacy sections the brief already states", () => {
    const report = formatGateReport(blockedEvaluation(50), 70);

    // Verdict + risk row: the brief's headline.
    expect(report).not.toContain("| **Release Ready** |");
    expect(report).not.toContain("| Risk |");
    expect(report).not.toContain("| Gate |");
    // Inputs: the brief's table.
    expect(report).not.toContain("### CI Checks");
    // Findings: the brief enumerates them; the legacy list only counts them.
    expect(report).not.toContain("Policy Findings");
    expect(report).not.toContain("Agent PR risk threshold tightened from 70 to 50.");
    // Said exactly once, in the brief.
    expect(report.split("web e2e")).toHaveLength(2);
  });

  it("renders the pre-ADR-011 report unchanged when no brief is attached", () => {
    const evaluated = blockedEvaluation(50);
    delete evaluated.releaseBrief;

    const report = formatGateReport(evaluated, 70);

    expect(report.startsWith("## 🚫 Trailhead — NOT RELEASE READY")).toBe(true);
    expect(report).not.toContain("## Release Brief");
    // The full legacy report survives for older evaluations being re-rendered,
    // threshold included — there is no brief to take it from.
    expect(report).toContain("| **Release Ready** | **NO** |");
    expect(report).toContain("| Risk | 53/100 (threshold 70) |");
    expect(report).toContain("| Gate | BLOCK |");
    expect(report).toContain("### CI Checks");
    expect(report).toContain("Policy Findings");
  });
});

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

describe("input_relevance config schema", () => {
  const yaml = `schema_version: 2
contexts:
  - name: master-promotion
    match:
      base_branch: [master]
      head_branch: [staging]
    availability: fail_closed
    ci:
      required_checks: [CI Gate, Deploy Edge Functions]
    input_relevance:
      - pattern: "Deploy Edge Functions"
        disposition: irrelevant
        reason: "staging target unconfigured by design"
      - pattern: "Vercel"
        disposition: advisory
`;

  it("parses the nested branch-pair relevance table", () => {
    const parsed = parseRepoConfigContent(yaml);
    expect(parsed).not.toBeNull();
    const context = parsed!.contexts[0];
    expect(context.availability).toBe("fail_closed");
    expect(context.input_relevance).toEqual([
      {
        pattern: "Deploy Edge Functions",
        disposition: "irrelevant",
        reason: "staging target unconfigured by design",
      },
      { pattern: "Vercel", disposition: "advisory" },
    ]);
  });

  it("defaults input_relevance to [] and availability to undefined for old configs", () => {
    const parsed = parseRepoConfigContent(`schema_version: 2
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    ci:
      required_checks: [Lint]
`);
    expect(parsed!.contexts[0].input_relevance).toEqual([]);
    expect(parsed!.contexts[0].availability).toBeUndefined();
  });

  it("warns — but does not drop the config — when irrelevant has no reason", () => {
    const parsed = parseRepoConfigContent(`schema_version: 2
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    input_relevance:
      - pattern: "Deploy Edge Functions"
        disposition: irrelevant
`);
    expect(parsed).not.toBeNull();
    const warnings = collectConfigWarnings(parsed!);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Deploy Edge Functions");
    expect(warnings[0]).toContain("irrelevant");
  });

  it("does not warn for blocking or advisory entries without a reason", () => {
    const parsed = parseRepoConfigContent(`schema_version: 2
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    input_relevance:
      - pattern: "Vercel"
        disposition: advisory
`);
    expect(collectConfigWarnings(parsed!)).toEqual([]);
  });
});
