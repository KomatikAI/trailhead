import { describe, expect, it } from "vitest";
import {
  buildDashboardAnalytics,
  computeAgentLoopEfficiency,
  computeCiFailureCorrelation,
  computeReleaseReadyStats,
  computeRiskTrend,
} from "./analytics.js";
import type { StoredEvaluation } from "./types.js";

function evalRow(overrides: Partial<StoredEvaluation> = {}): StoredEvaluation {
  return {
    id: "e1",
    orgId: "komatik",
    repoId: "KomatikAI/trailhead",
    commitSha: "abc",
    healthScore: 100,
    riskScore: 40,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 10,
    receivedAt: "2026-05-20T12:00:00.000Z",
    releaseReady: true,
    ...overrides,
  };
}

describe("analytics", () => {
  it("computes daily risk trend", () => {
    const rows = [
      evalRow({ id: "1", riskScore: 30, receivedAt: "2026-05-20T10:00:00.000Z" }),
      evalRow({ id: "2", riskScore: 50, receivedAt: "2026-05-20T14:00:00.000Z" }),
      evalRow({ id: "3", riskScore: 80, receivedAt: "2026-05-21T10:00:00.000Z" }),
    ];
    const trend = computeRiskTrend(rows, { days: 30, now: new Date("2026-05-22") });
    expect(trend).toEqual([
      { date: "2026-05-20", avgRisk: 40, count: 2 },
      { date: "2026-05-21", avgRisk: 80, count: 1 },
    ]);
  });

  it("computes release ready pass rate by context", () => {
    const rows = [
      evalRow({
        releaseReady: true,
        context: { name: "feature" },
      }),
      evalRow({
        id: "2",
        releaseReady: false,
        context: { name: "promotion" },
      }),
      evalRow({ id: "3", releaseReady: undefined }),
    ];
    const stats = computeReleaseReadyStats(rows, {
      days: 30,
      now: new Date("2026-05-22"),
    });
    expect(stats.pass).toBe(1);
    expect(stats.fail).toBe(1);
    expect(stats.unknown).toBe(1);
    expect(stats.passRate).toBe(50);
    expect(stats.byContext.feature.pass).toBe(1);
    expect(stats.byContext.promotion.fail).toBe(1);
  });

  it("correlates CI failures with release ready failures", () => {
    const rows = [
      evalRow({
        releaseReady: false,
        ci: { failedCount: 2, checks: [] },
      }),
      evalRow({
        id: "2",
        releaseReady: true,
        ci: { failedCount: 0, checks: [] },
      }),
      evalRow({
        id: "3",
        releaseReady: false,
        ci: { failedCount: 0, checks: [] },
      }),
    ];
    const corr = computeCiFailureCorrelation(rows, {
      days: 30,
      now: new Date("2026-05-22"),
    });
    expect(corr.ciFailed).toBe(1);
    expect(corr.releaseReadyFailed).toBe(2);
    expect(corr.both).toBe(1);
    expect(corr.releaseReadyFailedOnly).toBe(1);
  });

  it("builds dashboard analytics bundle", () => {
    const bundle = buildDashboardAnalytics(
      [evalRow()],
      [
        {
          orgId: "komatik",
          payload: {
            deploymentId: "d1",
            environment: "production",
            status: "success",
            timestamp: "2026-05-20T12:00:00.000Z",
          },
        },
      ],
      { days: 30, now: new Date("2026-05-22") },
    );
    expect(bundle.riskTrend.length).toBeGreaterThan(0);
    expect(bundle.releaseReady.pass).toBe(1);
    expect(bundle.cfr.successes).toBe(1);
    expect(bundle.agentLoopEfficiency.agents).toEqual([]);
  });

  it("computes agent loop efficiency by agent branch", () => {
    const rows = [
      evalRow({
        id: "ready-1",
        releaseReady: true,
        gateDecision: "allow",
        pr: { headRef: "agent/frontend-dev/fix-nav" },
        remediation: {
          loop_round: 2,
          next_action: "ready_to_merge",
        },
      }),
      evalRow({
        id: "block-1",
        releaseReady: false,
        gateDecision: "block",
        pr: { headRef: "agent/frontend-dev/fix-nav" },
        remediation: {
          loop_round: 1,
          next_action: "fix_and_retry",
        },
      }),
    ];

    const panel = computeAgentLoopEfficiency(rows, {
      days: 30,
      now: new Date("2026-05-22"),
    });

    expect(panel.agents).toHaveLength(1);
    expect(panel.agents[0].agentId).toBe("frontend-dev");
    expect(panel.agents[0].readyCount).toBe(1);
    expect(panel.agents[0].blockedCount).toBe(1);
    expect(panel.agents[0].medianRoundsToReady).toBe(2);
  });

  it("computes agent loop efficiency from stored provenance metadata", () => {
    const rows = [
      evalRow({
        id: "codex-blocked",
        releaseReady: false,
        gateDecision: "block",
        agentProvenanceId: "codex-reviewer",
      }),
      evalRow({
        id: "claude-ready",
        releaseReady: true,
        gateDecision: "allow",
        pr: {
          headRef: "claude/gate-polish",
          provenance: {
            type: "claude",
            confidence: 0.92,
            source: "claude-code",
          },
        },
        remediation: {
          loop_round: 3,
          next_action: "ready_to_merge",
        },
      }),
    ];

    const panel = computeAgentLoopEfficiency(rows, {
      days: 30,
      now: new Date("2026-05-22"),
    });

    expect(panel.agents.map((row) => row.agentId)).toEqual([
      "claude-code",
      "codex-reviewer",
    ]);
    expect(panel.agents.find((row) => row.agentId === "claude-code")).toMatchObject({
      readyCount: 1,
      medianRoundsToReady: 3,
    });
    expect(panel.agents.find((row) => row.agentId === "codex-reviewer")).toMatchObject({
      blockedCount: 1,
    });
  });
});
