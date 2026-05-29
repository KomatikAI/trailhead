import type { DetectorFeedbackRecord } from "./feedback-core.js";
import type { StoredEvaluation } from "./types.js";

export interface TuningDigestWindow {
  start: string;
  end: string;
  days: number;
}

export interface TuningDigestDetectorRow {
  code: string;
  blocked: number;
  warned: number;
  fixed_after_remediation: number;
  fp_signals: number;
  fp_rate: number;
  status: "ok" | "auto_downgraded" | "noisy";
  downgraded_at?: string;
}

export interface TuningDigestAgentRow {
  agent_id: string;
  prs: number;
  ready: number;
  blocked: number;
  abandoned: number;
  median_rounds_to_ready: number | null;
  sensitive_path_violations: number;
  trust_signal: "converging" | "flailing" | "quiet";
}

export interface TuningDigestPayload {
  schema: "trailhead.tuning-digest.v1";
  repo: string;
  window: TuningDigestWindow;
  totals: {
    evaluations: number;
    block: number;
    warn: number;
    allow: number;
    overrides: number;
    agent_prs: number;
  };
  detectors: TuningDigestDetectorRow[];
  agents: TuningDigestAgentRow[];
  overrides: Array<{
    pr_url?: string;
    author?: string;
    reason?: string;
    pre_decision?: string;
  }>;
  auto_downgrades_last_7d: Array<{
    detector: string;
    downgraded_at: string;
    fp_rate_at_trigger: number;
    tuning_issue?: string;
  }>;
}

export interface AgentRecentEvaluationsPayload {
  agent_id: string;
  window_days: number;
  evaluations: number;
  decisions: { allow: number; warn: number; block: number };
  ready_without_human: number;
  median_rounds_to_ready: number | null;
  p95_rounds_to_ready: number | null;
  sensitive_path_violations: number;
  top_detectors: Array<{ code: string; count: number }>;
  trust_signal_v1: "converging" | "flailing" | "quiet";
}

export interface DetectorDowngradeRecord {
  detectorCode: string;
  downgradedAt: string;
  fpRateAtTrigger: number;
  tuningIssueUrl?: string;
  revertedAt?: string;
  revertedBy?: string;
}

export interface AutoDowngradeCandidate {
  detector: string;
  fpRate: number;
  emissions: number;
  fpSignals: number;
  alreadyDowngraded: boolean;
}

function inWindow(iso: string, start: Date, end: Date): boolean {
  const ts = new Date(iso).getTime();
  return ts >= start.getTime() && ts <= end.getTime();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function resolveAgentProvenanceId(row: StoredEvaluation): string | null {
  const direct =
    (row as { agentProvenanceId?: string; agent_provenance_id?: string })
      .agentProvenanceId ?? (row as { agent_provenance_id?: string }).agent_provenance_id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const pr = row.pr as
    | { headRef?: string; provenance?: { source?: string; type?: string } }
    | undefined;
  if (pr?.provenance?.source?.trim()) return pr.provenance.source.trim();
  if (pr?.headRef) {
    const match = pr.headRef.match(/^agent\/([a-z0-9-]+)\//i);
    if (match?.[1]) return match[1];
  }
  if (pr?.provenance?.type && pr.provenance.type !== "human") {
    return pr.provenance.type;
  }
  return null;
}

export function extractDetectorCodes(row: StoredEvaluation): string[] {
  const codes = new Set<string>();
  const remediation = row.remediation as { fixes?: Array<{ code: string }> } | undefined;
  for (const fix of remediation?.fixes ?? []) {
    if (fix.code) codes.add(fix.code);
  }
  for (const factor of row.riskFactors ?? []) {
    if (typeof factor === "object" && factor !== null && "type" in factor) {
      const type = String((factor as { type: string }).type);
      if (type) codes.add(`risk.${type}`);
    }
  }
  const policyOverride = row.policyOverride ?? row.policy_override;
  if (policyOverride) {
    codes.add("policy.override");
  }
  return [...codes];
}

function filterEvaluations(
  rows: StoredEvaluation[],
  options: { repoId?: string; days: number; now?: Date },
): StoredEvaluation[] {
  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - options.days * 86_400_000);
  return rows.filter(
    (row) =>
      inWindow(row.receivedAt, start, now) &&
      (!options.repoId || row.repoId === options.repoId),
  );
}

function filterFeedback(
  rows: DetectorFeedbackRecord[],
  options: { repoId?: string; days: number; now?: Date },
): DetectorFeedbackRecord[] {
  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - options.days * 86_400_000);
  return rows.filter(
    (row) =>
      inWindow(row.timestamp, start, now) &&
      (!options.repoId || !row.repo || row.repo === options.repoId),
  );
}

export function buildTuningDigestV1(args: {
  repoId: string;
  evaluations: StoredEvaluation[];
  feedback: DetectorFeedbackRecord[];
  downgrades: DetectorDowngradeRecord[];
  days?: number;
  now?: Date;
  fpThreshold?: number;
}): TuningDigestPayload {
  const days = args.days ?? 7;
  const now = args.now ?? new Date();
  const start = new Date(now.getTime() - days * 86_400_000);
  const fpThreshold = args.fpThreshold ?? 0.15;
  const window: TuningDigestWindow = {
    start: start.toISOString(),
    end: now.toISOString(),
    days,
  };

  const evalRows = filterEvaluations(args.evaluations, {
    repoId: args.repoId,
    days,
    now,
  });
  const feedbackRows = filterFeedback(args.feedback, {
    repoId: args.repoId,
    days,
    now,
  });

  const downgradeByCode = new Map(
    args.downgrades.filter((d) => !d.revertedAt).map((d) => [d.detectorCode, d] as const),
  );

  const detectorStats = new Map<
    string,
    { blocked: number; warned: number; fixed: number }
  >();
  const agentStats = new Map<
    string,
    {
      prs: Set<number>;
      ready: number;
      blocked: number;
      abandoned: number;
      rounds: number[];
      sensitive: number;
    }
  >();

  let block = 0;
  let warn = 0;
  let allow = 0;
  let overrides = 0;
  let agentPrs = 0;

  const overridesList: TuningDigestPayload["overrides"] = [];

  for (const row of evalRows) {
    if (row.gateDecision === "block") block += 1;
    else if (row.gateDecision === "warn") warn += 1;
    else allow += 1;

    const agentId = resolveAgentProvenanceId(row);
    if (agentId) agentPrs += 1;

    const policyOverride = row.policyOverride ?? row.policy_override;
    if (policyOverride) {
      overrides += 1;
      const audit = policyOverride as {
        author?: string;
        reason?: string;
        preDecision?: string;
        pre_decision?: string;
      };
      overridesList.push({
        author: audit.author,
        reason: audit.reason,
        pre_decision: audit.preDecision ?? audit.pre_decision,
        pr_url: row.prNumber
          ? `https://github.com/${row.repoId}/pull/${row.prNumber}`
          : undefined,
      });
    }

    const codes = extractDetectorCodes(row);
    for (const code of codes) {
      const stat = detectorStats.get(code) ?? { blocked: 0, warned: 0, fixed: 0 };
      if (row.gateDecision === "block") stat.blocked += 1;
      else if (row.gateDecision === "warn") stat.warned += 1;
      const remediation = row.remediation as
        | { fixes_resolved?: unknown[]; next_action?: string }
        | undefined;
      if (
        (remediation?.fixes_resolved?.length ?? 0) > 0 ||
        remediation?.next_action === "ready_to_merge"
      ) {
        stat.fixed += 1;
      }
      detectorStats.set(code, stat);
    }

    if (agentId && row.prNumber !== undefined) {
      const bucket = agentStats.get(agentId) ?? {
        prs: new Set<number>(),
        ready: 0,
        blocked: 0,
        abandoned: 0,
        rounds: [],
        sensitive: 0,
      };
      bucket.prs.add(row.prNumber);
      const remediation = row.remediation as
        | { loop_round?: number; next_action?: string }
        | undefined;
      if (row.releaseReady === true || remediation?.next_action === "ready_to_merge") {
        bucket.ready += 1;
        if (typeof remediation?.loop_round === "number") {
          bucket.rounds.push(remediation.loop_round);
        }
      } else if (row.gateDecision === "block") {
        bucket.blocked += 1;
      } else if (remediation?.next_action === "max_rounds_exceeded") {
        bucket.abandoned += 1;
      }
      if (codes.includes("risk.sensitive_files")) bucket.sensitive += 1;
      agentStats.set(agentId, bucket);
    }
  }

  const fpByDetector = new Map<string, number>();
  for (const fb of feedbackRows) {
    if (fb.disposition !== "false_positive") continue;
    fpByDetector.set(fb.detector, (fpByDetector.get(fb.detector) ?? 0) + 1);
  }

  const detectors: TuningDigestDetectorRow[] = [...detectorStats.entries()]
    .map(([code, stat]) => {
      const emissions = stat.blocked + stat.warned;
      const fp_signals = fpByDetector.get(code) ?? 0;
      const fp_rate =
        emissions > 0 ? Math.round((fp_signals / emissions) * 1000) / 1000 : 0;
      const downgrade = downgradeByCode.get(code);
      let status: TuningDigestDetectorRow["status"] = "ok";
      if (downgrade) status = "auto_downgraded";
      else if (fp_rate >= fpThreshold) status = "noisy";

      return {
        code,
        blocked: stat.blocked,
        warned: stat.warned,
        fixed_after_remediation: stat.fixed,
        fp_signals,
        fp_rate,
        status,
        downgraded_at: downgrade?.downgradedAt,
      };
    })
    .sort((a, b) => b.fp_rate - a.fp_rate || b.blocked - a.blocked);

  const agents: TuningDigestAgentRow[] = [...agentStats.entries()]
    .map(([agent_id, stat]) => {
      const evalCount = stat.ready + stat.blocked + stat.abandoned;
      const readyRate = evalCount > 0 ? stat.ready / evalCount : 0;
      const med = median(stat.rounds);
      let trust_signal: TuningDigestAgentRow["trust_signal"] = "quiet";
      if (evalCount >= 10) {
        if (readyRate >= 0.6) trust_signal = "converging";
        else if (med !== null && med > 3) trust_signal = "flailing";
        else trust_signal = "converging";
      }
      return {
        agent_id,
        prs: stat.prs.size,
        ready: stat.ready,
        blocked: stat.blocked,
        abandoned: stat.abandoned,
        median_rounds_to_ready: med,
        sensitive_path_violations: stat.sensitive,
        trust_signal,
      };
    })
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id));

  const auto_downgrades_last_7d = args.downgrades
    .filter((d) => inWindow(d.downgradedAt, start, now) && !d.revertedAt)
    .map((d) => ({
      detector: d.detectorCode,
      downgraded_at: d.downgradedAt,
      fp_rate_at_trigger: d.fpRateAtTrigger,
      tuning_issue: d.tuningIssueUrl,
    }));

  return {
    schema: "trailhead.tuning-digest.v1",
    repo: args.repoId,
    window,
    totals: {
      evaluations: evalRows.length,
      block,
      warn,
      allow,
      overrides,
      agent_prs: agentPrs,
    },
    detectors,
    agents,
    overrides: overridesList.slice(0, 10),
    auto_downgrades_last_7d,
  };
}

export function buildAgentRecentEvaluations(args: {
  agentId: string;
  evaluations: StoredEvaluation[];
  days?: number;
  now?: Date;
  repoId?: string;
}): AgentRecentEvaluationsPayload {
  const days = args.days ?? 30;
  const now = args.now ?? new Date();
  const rows = filterEvaluations(args.evaluations, {
    repoId: args.repoId,
    days,
    now,
  }).filter((row) => resolveAgentProvenanceId(row) === args.agentId);

  const decisions = { allow: 0, warn: 0, block: 0 };
  let ready_without_human = 0;
  const rounds: number[] = [];
  let sensitive_path_violations = 0;
  const detectorCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.gateDecision === "allow") decisions.allow += 1;
    else if (row.gateDecision === "warn") decisions.warn += 1;
    else decisions.block += 1;

    const remediation = row.remediation as
      | { loop_round?: number; next_action?: string }
      | undefined;
    if (row.releaseReady === true || remediation?.next_action === "ready_to_merge") {
      ready_without_human += 1;
      if (typeof remediation?.loop_round === "number") {
        rounds.push(remediation.loop_round);
      }
    }

    const codes = extractDetectorCodes(row);
    if (codes.includes("risk.sensitive_files")) sensitive_path_violations += 1;
    for (const code of codes) {
      detectorCounts.set(code, (detectorCounts.get(code) ?? 0) + 1);
    }
  }

  const evaluations = rows.length;
  const med = median(rounds);
  const p95 = percentile(rounds, 95);

  let trust_signal_v1: AgentRecentEvaluationsPayload["trust_signal_v1"] = "quiet";
  if (evaluations >= 10) {
    const readyRate = evaluations > 0 ? ready_without_human / evaluations : 0;
    if (readyRate >= 0.6) trust_signal_v1 = "converging";
    else if (med !== null && med > 3) trust_signal_v1 = "flailing";
    else trust_signal_v1 = "converging";
  }

  const top_detectors = [...detectorCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    agent_id: args.agentId,
    window_days: days,
    evaluations,
    decisions,
    ready_without_human,
    median_rounds_to_ready: med,
    p95_rounds_to_ready: p95,
    sensitive_path_violations,
    top_detectors,
    trust_signal_v1,
  };
}

export function evaluateAutoDowngradeCandidates(args: {
  evaluations: StoredEvaluation[];
  feedback: DetectorFeedbackRecord[];
  downgrades: DetectorDowngradeRecord[];
  days?: number;
  now?: Date;
  fpThreshold?: number;
  minEmissions?: number;
}): AutoDowngradeCandidate[] {
  const days = args.days ?? 7;
  const now = args.now ?? new Date();
  const fpThreshold = args.fpThreshold ?? 0.15;
  const minEmissions = args.minEmissions ?? 10;

  const activeDowngrades = new Set(
    args.downgrades.filter((d) => !d.revertedAt).map((d) => d.detectorCode),
  );

  const emissionsByCode = new Map<string, number>();
  for (const row of filterEvaluations(args.evaluations, { days, now })) {
    for (const code of extractDetectorCodes(row)) {
      emissionsByCode.set(code, (emissionsByCode.get(code) ?? 0) + 1);
    }
  }

  const fleetDetectors = new Map<
    string,
    { blocked: number; warned: number; fp_signals: number }
  >();
  for (const row of filterEvaluations(args.evaluations, { days, now })) {
    for (const code of extractDetectorCodes(row)) {
      const stat = fleetDetectors.get(code) ?? {
        blocked: 0,
        warned: 0,
        fp_signals: 0,
      };
      if (row.gateDecision === "block") stat.blocked += 1;
      else if (row.gateDecision === "warn") stat.warned += 1;
      fleetDetectors.set(code, stat);
    }
  }
  for (const fb of filterFeedback(args.feedback, { days, now })) {
    if (fb.disposition !== "false_positive") continue;
    const stat = fleetDetectors.get(fb.detector) ?? {
      blocked: 0,
      warned: 0,
      fp_signals: 0,
    };
    stat.fp_signals += 1;
    fleetDetectors.set(fb.detector, stat);
  }

  return [...fleetDetectors.entries()]
    .map(([detector, stat]) => {
      const emissions = stat.blocked + stat.warned;
      const fpRate =
        emissions > 0 ? Math.round((stat.fp_signals / emissions) * 1000) / 1000 : 0;
      return {
        detector,
        fpRate,
        emissions,
        fpSignals: stat.fp_signals,
        alreadyDowngraded: activeDowngrades.has(detector),
      };
    })
    .filter(
      (row) =>
        row.emissions >= minEmissions &&
        row.fpRate >= fpThreshold &&
        !row.alreadyDowngraded,
    )
    .sort((a, b) => b.fpRate - a.fpRate);
}
