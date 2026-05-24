import { describe, expect, it } from "vitest";
import {
  buildDashboardAnalytics,
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
  });
});
