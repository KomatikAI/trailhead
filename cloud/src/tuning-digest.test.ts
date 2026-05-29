import { describe, expect, it } from "vitest";
import {
  buildAgentRecentEvaluations,
  buildTuningDigestV1,
  evaluateAutoDowngradeCandidates,
} from "./tuning-digest.js";
import type { DetectorFeedbackRecord } from "./feedback-core.js";
import type { StoredEvaluation } from "./types.js";

function evalRow(overrides: Partial<StoredEvaluation> = {}): StoredEvaluation {
  return {
    id: "e1",
    orgId: "komatik",
    repoId: "KomatikAI/trailhead",
    commitSha: "abc",
    healthScore: 100,
    riskScore: 40,
    gateDecision: "warn",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 10,
    receivedAt: "2026-05-20T12:00:00.000Z",
    prNumber: 42,
    ...overrides,
  };
}

function feedback(
  overrides: Partial<DetectorFeedbackRecord> = {},
): DetectorFeedbackRecord {
  return {
    id: "fb-1",
    orgId: "komatik",
    detector: "policy.duplicate_logic",
    disposition: "false_positive",
    repo: "KomatikAI/trailhead",
    timestamp: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("tuning-digest", () => {
  it("builds v1 digest with detector FP rates", () => {
    const evaluations = [
      evalRow({
        id: "1",
        gateDecision: "warn",
        remediation: {
          fixes: [{ code: "policy.duplicate_logic", severity: "warn" }],
        },
        pr: {
          headRef: "agent/frontend-dev/fix",
          provenance: { type: "claude", confidence: 0.9, source: "frontend-dev" },
        },
      }),
      evalRow({
        id: "2",
        gateDecision: "block",
        remediation: {
          fixes: [{ code: "policy.duplicate_logic", severity: "blocking" }],
        },
      }),
    ];
    const feedbackRows = Array.from({ length: 6 }, (_, i) => feedback({ id: `fp-${i}` }));

    const digest = buildTuningDigestV1({
      repoId: "KomatikAI/trailhead",
      evaluations,
      feedback: feedbackRows,
      downgrades: [],
      now: new Date("2026-05-22"),
    });

    expect(digest.schema).toBe("trailhead.tuning-digest.v1");
    expect(digest.totals.evaluations).toBe(2);
    expect(digest.totals.agent_prs).toBe(1);
    const detector = digest.detectors.find((d) => d.code === "policy.duplicate_logic");
    expect(detector?.fp_rate).toBe(3);
    expect(detector?.status).toBe("noisy");
  });

  it("returns agent recent evaluations with trust signal", () => {
    const evaluations = Array.from({ length: 12 }, (_, i) =>
      evalRow({
        id: `a-${i}`,
        gateDecision: i % 3 === 0 ? "block" : "allow",
        releaseReady: i % 3 !== 0,
        agentProvenanceId: "frontend-dev",
        remediation: {
          loop_round: 2,
          next_action: i % 3 !== 0 ? "ready_to_merge" : "fix_and_retry",
          fixes: [{ code: "risk.test_coverage" }],
        },
      }),
    );

    const stats = buildAgentRecentEvaluations({
      agentId: "frontend-dev",
      evaluations,
      now: new Date("2026-05-22"),
    });

    expect(stats.evaluations).toBe(12);
    expect(stats.trust_signal_v1).toBe("converging");
    expect(stats.top_detectors[0]?.code).toBe("risk.test_coverage");
  });

  it("flags auto-downgrade candidates at fleet threshold", () => {
    const evaluations = Array.from({ length: 12 }, (_, i) =>
      evalRow({
        id: `d-${i}`,
        gateDecision: i < 2 ? "block" : "warn",
        remediation: {
          fixes: [{ code: "policy.duplicate_logic", severity: "warn" }],
        },
      }),
    );
    const feedbackRows = Array.from({ length: 6 }, (_, i) => feedback({ id: `fp-${i}` }));

    const candidates = evaluateAutoDowngradeCandidates({
      evaluations,
      feedback: feedbackRows,
      downgrades: [],
      now: new Date("2026-05-22"),
      minEmissions: 10,
      fpThreshold: 0.15,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].detector).toBe("policy.duplicate_logic");
    expect(candidates[0].fpRate).toBeGreaterThanOrEqual(0.15);
  });
});
