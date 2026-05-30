import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { GateEvaluation } from "../types.js";
import {
  aggregateVerdictPenaltyQuality,
  buildGateVerdict,
  computeSubmissionPenalty,
  parseGateVerdict,
  projectVerdictToTrustCorrelation,
  TRAILHEAD_VERDICT_SCHEMA,
  TrailheadVerdictSchema,
} from "../verdict.js";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../examples/verdict",
);

function baseEvaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "dg-abc1234-1710000000000",
    repoId: "KomatikAI/agents",
    commitSha: "abc1234567890abcdef1234567890abcdef12345678",
    prNumber: 203,
    healthScore: 100,
    riskScore: 42,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [{ type: "file_count", score: 35 }],
    evaluationMs: 120,
    gateMode: "release-ready",
    releaseReady: true,
    pr: {
      headRef: "agent/pixel/suggestions/pack/ui-tweak",
      provenance: { type: "custom-bot", confidence: 0.9, source: "pixel" },
    },
    submissionChecks: [
      {
        code: "context_freshness",
        severity: "warn",
        title: "Stale naming",
        detail: "Deprecated term found",
        files: ["README.md"],
        autofix_eligible: true,
      },
    ],
    trust_profile: {
      strictness: "elevated",
      reason: "Agent trust score 0.72 (standard)",
      score: 0.72,
      profile: "standard",
    },
    ...overrides,
  };
}

describe("verdict", () => {
  it("builds trailhead.verdict.v1 from GateEvaluation", () => {
    const verdict = buildGateVerdict(baseEvaluation(), {
      evaluatedAt: "2026-05-30T12:00:00.000Z",
      agentId: "pixel",
      trustRuntime: {
        enabled: true,
        shadow: true,
        enforce: false,
        injectTrustJson: false,
      },
    });

    expect(verdict.schema).toBe(TRAILHEAD_VERDICT_SCHEMA);
    expect(verdict.agent_id).toBe("pixel");
    expect(verdict.penalty.semantics).toBe("lower_is_cleaner");
    expect(verdict.penalty.factor_scores.context_freshness).toBe(2);
    expect(verdict.risk.semantics).toBe("higher_is_worse");
    expect(verdict.trust_profile?.shadow).toBe(true);
    expect(verdict._legacy?.riskScore).toBe(42);
  });

  it("round-trips through JSON parse", () => {
    const raw = JSON.stringify(buildGateVerdict(baseEvaluation()));
    const parsed = parseGateVerdict(raw);
    expect(parsed?.evaluation_id).toBe("dg-abc1234-1710000000000");
    expect(TrailheadVerdictSchema.safeParse(parsed).success).toBe(true);
  });

  it("validates committed example fixture", () => {
    const fixture = JSON.parse(
      readFileSync(path.join(fixtureDir, "gate-allow-clean.v1.json"), "utf8"),
    );
    expect(TrailheadVerdictSchema.safeParse(fixture).success).toBe(true);
  });

  it("aggregates penalty quality for trust collectors", () => {
    const verdicts = [0.5, 1.0, 2.5].map((total_score, index) => {
      const verdict = buildGateVerdict(baseEvaluation({ id: `dg-${index}` }));
      return {
        ...verdict,
        penalty: {
          ...verdict.penalty,
          total_score,
          factor_scores: { mock: total_score },
        },
      };
    });

    const quality = aggregateVerdictPenaltyQuality(verdicts);
    expect(quality?.sampleCount).toBe(3);
    expect(quality?.cleanRate).toBeCloseTo(2 / 3, 2);
  });

  it("projects verdict to trust correlation ids", () => {
    const verdict = buildGateVerdict(baseEvaluation(), { agentId: "pixel" });
    const correlation = projectVerdictToTrustCorrelation(verdict);
    expect(correlation.evaluation_id).toBe(verdict.evaluation_id);
    expect(correlation.agent_id).toBe("pixel");
  });

  it("computes zero penalty for clean submissions", () => {
    expect(computeSubmissionPenalty([]).total_score).toBe(0);
  });
});
