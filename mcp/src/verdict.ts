// Stable versioned gate verdict contract (epic #252 / issue #260).

import { z } from "zod";
import type { GateEvaluation, SubmissionCheckResult } from "./types.js";
import { GateDecision, SubmissionCheckCode } from "./types.js";
import type { TrustRuntime } from "./trust-runtime.js";
import { DEFAULT_TRUST_COLLECTOR_CONFIG } from "./agent-trust-metrics.js";
import type { PenaltyQualitySignal } from "./agent-trust-metrics.js";

export const TRAILHEAD_VERDICT_SCHEMA = "trailhead.verdict.v1" as const;

export const PENALTY_SEMANTICS = "lower_is_cleaner" as const;
export const RISK_SEMANTICS = "higher_is_worse" as const;

const SEVERITY_PENALTY: Record<SubmissionCheckResult["severity"], number> = {
  blocking: 3,
  warn: 2,
  advisory: 1,
};

export const VerdictPenaltySchema = z.object({
  total_score: z.number().min(0),
  factor_scores: z.record(z.number().min(0)),
  semantics: z.literal(PENALTY_SEMANTICS),
});
export type VerdictPenalty = z.infer<typeof VerdictPenaltySchema>;

export const VerdictRiskSchema = z.object({
  score: z.number().min(0).max(100),
  semantics: z.literal(RISK_SEMANTICS),
  factors: z.record(z.number().min(0).max(100)),
});
export type VerdictRisk = z.infer<typeof VerdictRiskSchema>;

export const VerdictTrustProfileSchema = z.object({
  shadow: z.boolean().optional(),
  enforce: z.boolean().optional(),
  score: z.number().min(0).max(1).optional(),
  profile: z.enum(["fast-track", "standard", "probation"]).optional(),
  strictness: z.enum(["baseline", "elevated", "strict"]),
  reason: z.string(),
  factors: z.record(z.number()).optional(),
});
export type VerdictTrustProfile = z.infer<typeof VerdictTrustProfileSchema>;

export const VerdictRemediationSchema = z.object({
  loop_round: z.number().int().min(0).optional(),
  max_loop_rounds: z.number().int().min(0).optional(),
  next_action: z.string().optional(),
  fix_count: z.number().int().min(0).optional(),
});
export type VerdictRemediation = z.infer<typeof VerdictRemediationSchema>;

export const TrailheadVerdictSchema = z.object({
  schema: z.literal(TRAILHEAD_VERDICT_SCHEMA),
  evaluation_id: z.string(),
  repo_id: z.string(),
  commit_sha: z.string(),
  pr_number: z.number().int().positive().optional(),
  head_ref: z.string().optional(),
  agent_id: z.string().optional(),
  decision: GateDecision,
  gate_mode: z.enum(["risk-only", "advisory", "release-ready"]).optional(),
  release_ready: z.boolean().optional(),
  penalty: VerdictPenaltySchema,
  risk: VerdictRiskSchema,
  trust_profile: VerdictTrustProfileSchema.optional(),
  submission_checks: z.array(
    z.object({
      code: SubmissionCheckCode,
      severity: z.enum(["blocking", "warn", "advisory"]),
      title: z.string(),
      detail: z.string(),
      files: z.array(z.string()).default([]),
    }),
  ),
  remediation: VerdictRemediationSchema.optional(),
  reasons: z.array(z.string()),
  evaluated_at: z.string(),
  /** Deprecated flat fields — remove after one release (#260). */
  _legacy: z
    .object({
      riskScore: z.number(),
      healthScore: z.number(),
      releaseReadyReasons: z.array(z.string()).optional(),
      policyFindings: z.array(z.string()).optional(),
    })
    .optional(),
});
export type TrailheadVerdict = z.infer<typeof TrailheadVerdictSchema>;

export function computeSubmissionPenalty(
  checks: SubmissionCheckResult[] = [],
): VerdictPenalty {
  const factor_scores: Record<string, number> = {};
  for (const check of checks) {
    const penalty = SEVERITY_PENALTY[check.severity] ?? 0;
    factor_scores[check.code] = Math.max(factor_scores[check.code] ?? 0, penalty);
  }

  const values = Object.values(factor_scores);
  const total_score =
    values.length === 0
      ? 0
      : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) /
        10;

  return {
    total_score,
    factor_scores,
    semantics: PENALTY_SEMANTICS,
  };
}

export function collectVerdictReasons(evaluation: GateEvaluation): string[] {
  const reasons = new Set<string>();

  for (const finding of evaluation.policyFindings ?? []) {
    reasons.add(finding);
  }
  for (const reason of evaluation.releaseReadyReasons ?? []) {
    reasons.add(reason);
  }
  if (evaluation.remediation?.next_action) {
    reasons.add(`Remediation next action: ${evaluation.remediation.next_action}`);
  }
  if (evaluation.trust_profile?.reason) {
    reasons.add(evaluation.trust_profile.reason);
  }
  if (evaluation.gateDecision === "block") {
    reasons.add("Gate decision is BLOCK");
  } else if (evaluation.gateDecision === "warn") {
    reasons.add("Gate decision is WARN");
  }

  return [...reasons];
}

export interface BuildGateVerdictOptions {
  evaluatedAt?: string;
  trustRuntime?: TrustRuntime;
  agentId?: string | null;
}

export function buildGateVerdict(
  evaluation: GateEvaluation,
  options: BuildGateVerdictOptions = {},
): TrailheadVerdict {
  const checks = evaluation.submissionChecks ?? [];
  const penalty = computeSubmissionPenalty(checks);
  const trustRuntime = options.trustRuntime;

  const verdict: TrailheadVerdict = {
    schema: TRAILHEAD_VERDICT_SCHEMA,
    evaluation_id: evaluation.id,
    repo_id: evaluation.repoId,
    commit_sha: evaluation.commitSha,
    pr_number: evaluation.prNumber,
    head_ref: evaluation.pr?.headRef,
    agent_id: options.agentId ?? undefined,
    decision: evaluation.gateDecision,
    gate_mode: evaluation.gateMode,
    release_ready: evaluation.releaseReady,
    penalty,
    risk: {
      score: evaluation.riskScore,
      semantics: RISK_SEMANTICS,
      factors: Object.fromEntries(
        evaluation.riskFactors.map((factor) => [factor.type, factor.score]),
      ),
    },
    trust_profile: evaluation.trust_profile
      ? {
          shadow: trustRuntime?.shadow,
          enforce: trustRuntime?.enforce,
          score: evaluation.trust_profile.score,
          profile: evaluation.trust_profile.profile,
          strictness: evaluation.trust_profile.strictness,
          reason: evaluation.trust_profile.reason,
          factors: evaluation.trust_profile.factors,
        }
      : undefined,
    submission_checks: checks.map((check) => ({
      code: check.code,
      severity: check.severity,
      title: check.title,
      detail: check.detail,
      files: check.files ?? [],
    })),
    remediation: evaluation.remediation
      ? {
          loop_round: evaluation.remediation.loop_round,
          max_loop_rounds: evaluation.remediation.max_loop_rounds,
          next_action: evaluation.remediation.next_action,
          fix_count: evaluation.remediation.fixes?.length,
        }
      : undefined,
    reasons: collectVerdictReasons(evaluation),
    evaluated_at: options.evaluatedAt ?? new Date().toISOString(),
    _legacy: {
      riskScore: evaluation.riskScore,
      healthScore: evaluation.healthScore,
      releaseReadyReasons: evaluation.releaseReadyReasons,
      policyFindings: evaluation.policyFindings,
    },
  };

  return TrailheadVerdictSchema.parse(verdict);
}

export function parseGateVerdict(raw: string | unknown): TrailheadVerdict | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = TrailheadVerdictSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Collector helper: map penalty verdicts to trust penaltyQuality stats. */
export function aggregateVerdictPenaltyQuality(
  verdicts: TrailheadVerdict[],
): PenaltyQualitySignal | null {
  const scores = verdicts.map((verdict) => verdict.penalty.total_score);
  if (scores.length === 0) return null;

  const count = scores.length;
  const mean = scores.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    count === 1 ? 0 : scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);
  const cleanThreshold = DEFAULT_TRUST_COLLECTOR_CONFIG.cleanPenaltyThreshold;
  const cleanCount = scores.filter((score) => score <= cleanThreshold).length;

  return {
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    cleanRate: Math.round((cleanCount / count) * 1000) / 1000,
    sampleCount: count,
  };
}

/** Example collector projection: one verdict → trust correlation fields. */
export function projectVerdictToTrustCorrelation(verdict: TrailheadVerdict): {
  evaluation_id: string;
  agent_id?: string;
  head_ref?: string;
  penalty: VerdictPenalty;
  release_ready_clean: boolean;
} {
  return {
    evaluation_id: verdict.evaluation_id,
    agent_id: verdict.agent_id,
    head_ref: verdict.head_ref,
    penalty: verdict.penalty,
    release_ready_clean:
      verdict.penalty.total_score <= DEFAULT_TRUST_COLLECTOR_CONFIG.cleanPenaltyThreshold,
  };
}
