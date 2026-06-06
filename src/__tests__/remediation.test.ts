import {
  buildRemediation,
  formatAgentBrief,
  resolveAgentBriefMode,
} from "../remediation.js";
import { Remediation } from "../types.js";
import type { GateEvaluation, RiskFactor } from "../types.js";

function evaluationFixture(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "eval-1",
    repoId: "owner/repo",
    commitSha: "abc123",
    prNumber: 42,
    healthScore: 95,
    riskScore: 30,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 100,
    releaseReady: true,
    releaseReadyReasons: [],
    ...overrides,
  } as GateEvaluation;
}

function factor(
  type: RiskFactor["type"],
  score: number,
  detail?: Record<string, unknown>,
): RiskFactor {
  return { type, score, detail };
}

describe("buildRemediation", () => {
  describe("schema", () => {
    it("returns a Zod-valid Remediation payload", () => {
      const remediation = buildRemediation({ evaluation: evaluationFixture() });
      expect(() => Remediation.parse(remediation)).not.toThrow();
      expect(remediation.schema).toBe("trailhead.remediation.v1");
    });

    it("always includes counts even on a clean PR", () => {
      const remediation = buildRemediation({ evaluation: evaluationFixture() });
      expect(remediation.blocking_count).toBe(0);
      expect(remediation.warn_count).toBe(0);
      expect(remediation.advisory_count).toBe(0);
      expect(remediation.autofix_eligible_count).toBe(0);
      expect(remediation.fixes).toEqual([]);
      expect(remediation.next_action).toBe("ready_to_merge");
    });
  });

  describe("risk factor mapping", () => {
    it("maps high test_coverage score to a blocking fix with autofix eligibility", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskScore: 75,
          riskFactors: [
            factor("test_coverage", 80, {
              missing_tests: ["src/foo.ts", "src/bar.ts"],
            }),
          ],
        }),
      });
      const fix = remediation.fixes.find((f) => f.code === "risk.test_coverage");
      expect(fix).toBeDefined();
      expect(fix?.severity).toBe("blocking");
      expect(fix?.autofix_eligible).toBe(true);
      expect(fix?.autofix_class).toBe("test-scaffold");
      expect(fix?.files).toEqual(["src/foo.ts", "src/bar.ts"]);
      expect(remediation.blocking_count).toBe(1);
      expect(remediation.autofix_eligible_count).toBe(1);
    });

    it("emits an advisory severity for low-scoring test_coverage", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          riskFactors: [factor("test_coverage", 35, { missing_tests: ["src/foo.ts"] })],
        }),
      });
      const fix = remediation.fixes.find((f) => f.code === "risk.test_coverage");
      expect(fix?.severity).toBe("warn");
    });

    it("emits a warn-severity sensitive_files fix", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          riskFactors: [
            factor("sensitive_files", 70, { files: ["src/auth/middleware.ts"] }),
          ],
        }),
      });
      const fix = remediation.fixes.find((f) => f.code === "risk.sensitive_files");
      expect(fix?.severity).toBe("warn");
      expect(fix?.autofix_eligible).toBe(false);
    });

    it("ignores factors below the advisory threshold", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          riskFactors: [factor("test_coverage", 10)],
        }),
      });
      expect(remediation.fixes).toEqual([]);
    });
  });

  describe("CI mapping", () => {
    it("creates a blocking fix for failing required checks", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          ci: {
            checks: [
              { name: "Build", status: "fail", required: true },
              { name: "Lint", status: "pass", required: true },
            ],
            allRequiredPassed: false,
            pendingCount: 0,
            failedCount: 1,
            missingCount: 0,
          },
        }),
      });
      const fix = remediation.fixes.find((f) => f.code === "ci.failed");
      expect(fix?.severity).toBe("blocking");
      expect(fix?.detail).toContain("Build");
    });

    it("creates a missing-check fix only for required checks", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          ci: {
            checks: [
              { name: "OptionalScan", status: "missing", required: false },
              { name: "RequiredScan", status: "missing", required: true },
            ],
            allRequiredPassed: false,
            pendingCount: 0,
            failedCount: 0,
            missingCount: 2,
          },
        }),
      });
      const fix = remediation.fixes.find((f) => f.code === "ci.missing");
      expect(fix?.severity).toBe("blocking");
      expect(fix?.detail).toContain("RequiredScan");
      expect(fix?.detail).not.toContain("OptionalScan");
    });
  });

  describe("policy findings", () => {
    it("rolls policy findings into a single blocking fix", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          policyFindings: [
            "Workflow uses unpinned action",
            "Secrets exposed in step env",
          ],
        }),
      });
      const fix = remediation.fixes.find((f) => f.code === "policy.finding");
      expect(fix?.severity).toBe("blocking");
      expect(fix?.detail).toContain("Workflow uses unpinned action");
      expect(fix?.detail).toContain("Secrets exposed");
    });
  });

  describe("deduplication and ordering", () => {
    it("deduplicates by code keeping the highest severity", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          riskFactors: [
            factor("test_coverage", 35, { missing_tests: ["src/foo.ts"] }),
            factor("test_coverage", 85, { missing_tests: ["src/foo.ts"] }),
          ],
        }),
      });
      const matches = remediation.fixes.filter((f) => f.code === "risk.test_coverage");
      expect(matches).toHaveLength(1);
      expect(matches[0].severity).toBe("blocking");
    });

    it("orders fixes blocking → warn → advisory", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [
            factor("sensitive_files", 70, { files: ["src/auth/login.ts"] }),
            factor("test_coverage", 85, { missing_tests: ["src/foo.ts"] }),
            factor("pr_scope", 25, { file_count: 12, line_count: 400 }),
          ],
        }),
      });
      const severities = remediation.fixes.map((f) => f.severity);
      expect(severities[0]).toBe("blocking");
      const lastSeverity = severities[severities.length - 1];
      expect(["warn", "advisory"]).toContain(lastSeverity);
    });
  });

  describe("release_ready semantics", () => {
    it("does not trust evaluation.releaseReady when blocking fixes remain", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          releaseReady: true,
          gateDecision: "allow",
          riskFactors: [
            factor("test_coverage", 80, { missing_tests: ["src/foo.ts"] }),
          ],
        }),
      });
      expect(remediation.blocking_count).toBe(1);
      expect(remediation.release_ready).toBe(false);
    });
  });

  describe("loop bookkeeping", () => {
    it("computes resolved and introduced codes vs. previous evaluation", () => {
      const previous = {
        id: "eval-0",
        remediation: {
          schema: "trailhead.remediation.v1",
          release_ready: false,
          fixes: [
            {
              code: "risk.test_coverage",
              severity: "blocking",
              title: "x",
              detail: "x",
              files: [],
              autofix_eligible: false,
            },
            {
              code: "ci.failed",
              severity: "blocking",
              title: "x",
              detail: "x",
              files: [],
              autofix_eligible: false,
            },
          ],
          blocking_count: 2,
          warn_count: 0,
          advisory_count: 0,
          autofix_eligible_count: 0,
          loop_round: 0,
          max_loop_rounds: 3,
          fixes_resolved: [],
          fixes_introduced: [],
          next_action: "fix_and_retry",
        },
      } as Pick<GateEvaluation, "id" | "remediation">;

      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 80, { missing_tests: ["src/x.ts"] })],
          policyFindings: ["new policy violation"],
        }),
        previousEvaluation: previous,
        loopRound: 1,
        maxLoopRounds: 3,
      });

      expect(remediation.fixes_resolved).toContain("ci.failed");
      expect(remediation.fixes_introduced).toContain("policy.finding");
      expect(remediation.loop_round).toBe(1);
      expect(remediation.previous_evaluation_id).toBe("eval-0");
    });

    it("auto-increments loop_round from previous evaluation when loopRound omitted", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 80, { missing_tests: ["src/x.ts"] })],
        }),
        previousEvaluation: {
          id: "eval-2",
          remediation: {
            schema: "trailhead.remediation.v1",
            release_ready: false,
            fixes: [],
            blocking_count: 1,
            warn_count: 0,
            advisory_count: 0,
            autofix_eligible_count: 0,
            loop_round: 2,
            max_loop_rounds: 3,
            fixes_resolved: [],
            fixes_introduced: [],
            next_action: "fix_and_retry",
          },
        },
      });

      expect(remediation.loop_round).toBe(3);
      expect(remediation.previous_evaluation_id).toBe("eval-2");
    });

    it("returns max_rounds_exceeded when loop hits cap with blocking issues", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 80, { missing_tests: ["src/x.ts"] })],
        }),
        loopRound: 3,
        maxLoopRounds: 3,
      });
      expect(remediation.next_action).toBe("max_rounds_exceeded");
    });
  });

  describe("next_action", () => {
    it("returns ready_to_merge on a clean release-ready PR", () => {
      const remediation = buildRemediation({ evaluation: evaluationFixture() });
      expect(remediation.next_action).toBe("ready_to_merge");
    });

    it("returns fix_and_retry when blocking fixes exist within loop budget", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 80, { missing_tests: ["src/x.ts"] })],
        }),
        loopRound: 1,
        maxLoopRounds: 5,
        agentProvenance: true,
      });
      expect(remediation.next_action).toBe("fix_and_retry");
    });

    it("returns fix_and_retry for agent warn-only routine findings", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "warn",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 45, { missing_tests: ["src/foo.ts"] })],
        }),
        agentProvenance: true,
      });
      expect(remediation.next_action).toBe("fix_and_retry");
    });

    it("returns human_review_required for agent red-lane findings", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [],
        }),
        submissionChecks: [
          {
            code: "mock_placeholder",
            severity: "blocking",
            title: "Mock leak",
            detail: "TODO(mock) in handler",
            files: ["src/handler.ts"],
            autofix_eligible: false,
          },
        ],
        agentProvenance: true,
      });
      expect(remediation.next_action).toBe("human_review_required");
    });

    it("returns human_review_required when not release-ready but no blockers (human PR)", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "warn",
          releaseReady: false,
          riskFactors: [factor("sensitive_files", 70, { files: ["src/auth/x.ts"] })],
        }),
      });
      expect(remediation.next_action).toBe("human_review_required");
    });
  });

  describe("resolveAgentBriefMode", () => {
    it("defaults to off for human provenance", () => {
      expect(resolveAgentBriefMode({ provenanceType: "human" })).toBe("off");
    });

    it("defaults to collapsed for agent provenance", () => {
      expect(resolveAgentBriefMode({ provenanceType: "claude" })).toBe("collapsed");
      expect(resolveAgentBriefMode({ provenanceType: "unknown" })).toBe("collapsed");
    });

    it("prefers action input over repo setting and provenance default", () => {
      expect(
        resolveAgentBriefMode({
          actionSetting: "expanded",
          repoSetting: "off",
          provenanceType: "human",
        }),
      ).toBe("expanded");
    });

    it("uses repo setting when action input is absent", () => {
      expect(
        resolveAgentBriefMode({
          repoSetting: "expanded",
          provenanceType: "human",
        }),
      ).toBe("expanded");
    });
  });

  describe("formatAgentBrief", () => {
    it("returns empty string when mode is off", () => {
      const remediation = buildRemediation({ evaluation: evaluationFixture() });
      expect(formatAgentBrief(remediation, "off")).toBe("");
    });

    it("renders collapsed details with JSON block and blocking fixes", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 80, { missing_tests: ["src/foo.ts"] })],
        }),
      });
      const brief = formatAgentBrief(remediation, "collapsed");
      expect(brief).toContain("<details>");
      expect(brief).toContain("Agent instructions");
      expect(brief).toContain('"schema": "trailhead.remediation.v1"');
      expect(brief).toContain("risk.test_coverage");
      expect(brief).toContain("fix_and_retry");
    });

    it("renders expanded section without details wrapper", () => {
      const remediation = buildRemediation({
        evaluation: evaluationFixture({
          gateDecision: "block",
          releaseReady: false,
          riskFactors: [factor("test_coverage", 80, { missing_tests: ["src/foo.ts"] })],
        }),
      });
      const brief = formatAgentBrief(remediation, "expanded");
      expect(brief).not.toContain("<details>");
      expect(brief).toContain("### 🤖 Agent instructions");
    });
  });
});
