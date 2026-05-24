import type { DeployEventPayload, StoredEvaluation } from "./types.js";

export interface AnalyticsOptions {
  repoId?: string;
  days: number;
  now?: Date;
}

function inWindow(iso: string, since: Date): boolean {
  return new Date(iso).getTime() >= since.getTime();
}

function filterEvaluations(
  rows: StoredEvaluation[],
  options: AnalyticsOptions,
): StoredEvaluation[] {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.days * 86_400_000);
  return rows.filter(
    (row) =>
      inWindow(row.receivedAt, since) &&
      (!options.repoId || row.repoId === options.repoId),
  );
}

function filterDeployEvents(
  rows: Array<{ orgId: string; payload: DeployEventPayload }>,
  options: AnalyticsOptions,
): DeployEventPayload[] {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.days * 86_400_000);
  return rows
    .map((r) => r.payload)
    .filter(
      (event) =>
        inWindow(event.timestamp, since) &&
        (!options.repoId || !event.repoId || event.repoId === options.repoId),
    );
}

export interface RiskTrendPoint {
  date: string;
  avgRisk: number;
  count: number;
}

export function computeRiskTrend(
  rows: StoredEvaluation[],
  options: AnalyticsOptions,
): RiskTrendPoint[] {
  const filtered = filterEvaluations(rows, options);
  const buckets = new Map<string, number[]>();

  for (const row of filtered) {
    const day = row.receivedAt.slice(0, 10);
    const list = buckets.get(day) ?? [];
    list.push(row.riskScore);
    buckets.set(day, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      avgRisk: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
      count: scores.length,
    }));
}

export interface ReleaseReadyStats {
  pass: number;
  fail: number;
  unknown: number;
  passRate: number;
  byContext: Record<string, { pass: number; fail: number }>;
}

export function computeReleaseReadyStats(
  rows: StoredEvaluation[],
  options: AnalyticsOptions,
): ReleaseReadyStats {
  const filtered = filterEvaluations(rows, options);
  let pass = 0;
  let fail = 0;
  let unknown = 0;
  const byContext: Record<string, { pass: number; fail: number }> = {};

  for (const row of filtered) {
    const contextName =
      typeof row.context === "object" &&
      row.context !== null &&
      "name" in row.context &&
      typeof row.context.name === "string"
        ? row.context.name
        : "default";

    if (!byContext[contextName]) {
      byContext[contextName] = { pass: 0, fail: 0 };
    }

    if (row.releaseReady === true) {
      pass += 1;
      byContext[contextName].pass += 1;
    } else if (row.releaseReady === false) {
      fail += 1;
      byContext[contextName].fail += 1;
    } else {
      unknown += 1;
    }
  }

  const known = pass + fail;
  return {
    pass,
    fail,
    unknown,
    passRate: known > 0 ? Math.round((pass / known) * 1000) / 10 : 0,
    byContext,
  };
}

export interface CiFailureCorrelation {
  total: number;
  ciFailed: number;
  releaseReadyFailed: number;
  both: number;
  ciFailedOnly: number;
  releaseReadyFailedOnly: number;
}

export function computeCiFailureCorrelation(
  rows: StoredEvaluation[],
  options: AnalyticsOptions,
): CiFailureCorrelation {
  const filtered = filterEvaluations(rows, options);
  let ciFailed = 0;
  let releaseReadyFailed = 0;
  let both = 0;

  for (const row of filtered) {
    const ci = row.ci as { failedCount?: number } | undefined;
    const failedChecks = (ci?.failedCount ?? 0) > 0;
    const rrFailed = row.releaseReady === false;

    if (failedChecks) ciFailed += 1;
    if (rrFailed) releaseReadyFailed += 1;
    if (failedChecks && rrFailed) both += 1;
  }

  return {
    total: filtered.length,
    ciFailed,
    releaseReadyFailed,
    both,
    ciFailedOnly: ciFailed - both,
    releaseReadyFailedOnly: releaseReadyFailed - both,
  };
}

export interface DoraProxyPanel {
  deploymentFrequencyPerWeek: number;
  changeFailureRate: number;
  avgLeadTimeHours: number | null;
  avgRiskScore: number;
  rating: "Elite" | "High" | "Medium" | "Low";
}

export function computeDoraProxy(
  evaluations: StoredEvaluation[],
  deployEvents: Array<{ orgId: string; payload: DeployEventPayload }>,
  options: AnalyticsOptions,
): DoraProxyPanel {
  const evalRows = filterEvaluations(evaluations, options);
  const deployRows = filterDeployEvents(deployEvents, options);

  const weeks = Math.max(options.days / 7, 1);
  const deploymentFrequencyPerWeek =
    Math.round((deployRows.length / weeks) * 10) / 10;

  const outcomes = deployRows.filter((e) => e.status !== "cancelled");
  const failures = outcomes.filter((e) => e.status === "failure").length;
  const changeFailureRate =
    outcomes.length > 0 ? Math.round((failures / outcomes.length) * 1000) / 10 : 0;

  const avgRiskScore =
    evalRows.length > 0
      ? Math.round(
          evalRows.reduce((sum, row) => sum + row.riskScore, 0) / evalRows.length,
        )
      : 0;

  let rating: DoraProxyPanel["rating"] = "Low";
  if (deploymentFrequencyPerWeek >= 1 && changeFailureRate <= 15 && avgRiskScore <= 50) {
    rating = "Elite";
  } else if (changeFailureRate <= 20 && avgRiskScore <= 65) {
    rating = "High";
  } else if (changeFailureRate <= 30) {
    rating = "Medium";
  }

  return {
    deploymentFrequencyPerWeek,
    changeFailureRate,
    avgLeadTimeHours: null,
    avgRiskScore,
    rating,
  };
}

export interface CfrStats {
  successes: number;
  failures: number;
  cancelled: number;
  cfr: number;
}

export function computeCfrStats(
  deployEvents: Array<{ orgId: string; payload: DeployEventPayload }>,
  options: AnalyticsOptions,
): CfrStats {
  const rows = filterDeployEvents(deployEvents, options);
  const successes = rows.filter((e) => e.status === "success").length;
  const failures = rows.filter((e) => e.status === "failure").length;
  const cancelled = rows.filter((e) => e.status === "cancelled").length;
  const known = successes + failures;

  return {
    successes,
    failures,
    cancelled,
    cfr: known > 0 ? Math.round((failures / known) * 1000) / 10 : 0,
  };
}

export interface DashboardAnalytics {
  windowDays: number;
  repoId: string | null;
  riskTrend: RiskTrendPoint[];
  releaseReady: ReleaseReadyStats;
  ciCorrelation: CiFailureCorrelation;
  dora: DoraProxyPanel;
  cfr: CfrStats;
}

export function buildDashboardAnalytics(
  evaluations: StoredEvaluation[],
  deployEvents: Array<{ orgId: string; payload: DeployEventPayload }>,
  options: AnalyticsOptions,
): DashboardAnalytics {
  return {
    windowDays: options.days,
    repoId: options.repoId ?? null,
    riskTrend: computeRiskTrend(evaluations, options),
    releaseReady: computeReleaseReadyStats(evaluations, options),
    ciCorrelation: computeCiFailureCorrelation(evaluations, options),
    dora: computeDoraProxy(evaluations, deployEvents, options),
    cfr: computeCfrStats(deployEvents, options),
  };
}
