// Phase B3 — dynamic agent trust scoring (pure module).

import {
  assessColdStartFromMetrics,
  DEFAULT_TRUST_COLLECTOR_CONFIG,
  type AgentTrustMetrics,
  type TrustCollectorConfig,
} from "./agent-trust-metrics.js";

export type { AgentTrustMetrics } from "./agent-trust-metrics.js";

export type TrustProfileName = "fast-track" | "standard" | "probation";

export interface AgentTrustResult {
  score: number;
  profile: TrustProfileName;
  factors: {
    release_ready_rate: number;
    revert_rate: number;
    human_review_required_rate: number;
    remediation_efficiency: number;
    policy_violation_rate: number;
    sensitive_path_violation_rate: number;
    penalty_clean_rate?: number;
    penalty_mean_quality?: number;
  };
  thresholdDelta: number;
  autofixEnabled: boolean;
  coldStart?: { reason: string };
}

const WEIGHTS = {
  release_ready_rate: 0.3,
  revert_resistance: 0.2,
  human_free_rate: 0.2,
  remediation_efficiency: 0.15,
  policy_violation_penalty: 0.075,
  sensitive_path_penalty: 0.075,
  penalty_mean_quality: 0.05,
};

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function remediationEfficiency(rounds: number[]): number {
  if (rounds.length === 0) return 0.5;
  const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
  return Math.max(0, Math.min(1, 1 - (avg - 1) / 4));
}

function penaltyMeanQuality(
  penaltyQuality: AgentTrustMetrics["penaltyQuality"],
  noisyThreshold: number,
): number | undefined {
  if (!penaltyQuality || penaltyQuality.sampleCount <= 0) return undefined;
  return Math.max(0, Math.min(1, 1 - penaltyQuality.mean / noisyThreshold));
}

export function computeAgentTrustScore(
  metrics: AgentTrustMetrics,
  options?: { config?: Partial<TrustCollectorConfig> },
): AgentTrustResult | null {
  const config = { ...DEFAULT_TRUST_COLLECTOR_CONFIG, ...options?.config };
  const coldStart = assessColdStartFromMetrics(metrics, config);
  if (!coldStart.emitTrust) {
    return null;
  }

  const n = Math.max(metrics.evaluations, 0);
  const releaseReadyRate = rate(metrics.releaseReadyCount, n);
  const penaltyCleanRate = metrics.penaltyQuality?.cleanRate;
  const releaseSignal =
    penaltyCleanRate !== undefined
      ? Math.max(releaseReadyRate, penaltyCleanRate)
      : releaseReadyRate;

  const revertRate = rate(metrics.revertCount, n);
  const humanReviewRate = rate(metrics.humanReviewRequiredCount, n);
  const policyViolationRate = rate(metrics.policyViolationCount, n);
  const sensitiveRate = rate(metrics.sensitivePathViolationCount, n);
  const remEff = remediationEfficiency(metrics.remediationRoundsToReady);
  const meanQuality = penaltyMeanQuality(
    metrics.penaltyQuality,
    config.noisyPenaltyThreshold,
  );

  const factors = {
    release_ready_rate: releaseSignal,
    revert_rate: revertRate,
    human_review_required_rate: humanReviewRate,
    remediation_efficiency: remEff,
    policy_violation_rate: policyViolationRate,
    sensitive_path_violation_rate: sensitiveRate,
    ...(penaltyCleanRate !== undefined ? { penalty_clean_rate: penaltyCleanRate } : {}),
    ...(meanQuality !== undefined ? { penalty_mean_quality: meanQuality } : {}),
  };

  let score =
    WEIGHTS.release_ready_rate * releaseSignal +
    WEIGHTS.revert_resistance * (1 - revertRate) +
    WEIGHTS.human_free_rate * (1 - humanReviewRate) +
    WEIGHTS.remediation_efficiency * remEff -
    WEIGHTS.policy_violation_penalty * policyViolationRate -
    WEIGHTS.sensitive_path_penalty * sensitiveRate;

  if (meanQuality !== undefined) {
    score += WEIGHTS.penalty_mean_quality * meanQuality;
  }

  score = Math.max(0, Math.min(1, score));

  let profile: TrustProfileName = "standard";
  if (score >= 0.85) profile = "fast-track";
  else if (score < 0.6) profile = "probation";

  const thresholdDelta =
    profile === "fast-track" ? 10 : profile === "probation" ? -10 : 0;

  return {
    score: Math.round(score * 1000) / 1000,
    profile,
    factors,
    thresholdDelta,
    autofixEnabled: profile !== "probation",
  };
}

export function strictnessFromTrust(
  trust: AgentTrustResult | null,
  riskScore: number,
): {
  strictness: "baseline" | "elevated" | "strict";
  reason: string;
  score?: number;
  profile?: TrustProfileName;
  factors?: AgentTrustResult["factors"];
} {
  if (!trust) {
    return riskScore >= 75
      ? {
          strictness: "strict",
          reason: "Automated provenance with high composite risk score",
        }
      : {
          strictness: "elevated",
          reason: "Automated provenance with elevated review requirements",
        };
  }

  if (trust.profile === "probation") {
    return {
      strictness: "strict",
      reason: `Agent trust score ${trust.score} — probation (human review required)`,
      score: trust.score,
      profile: trust.profile,
      factors: trust.factors,
    };
  }

  if (trust.profile === "fast-track" && riskScore < 60) {
    return {
      strictness: "baseline",
      reason: `Agent trust score ${trust.score} — fast-track profile`,
      score: trust.score,
      profile: trust.profile,
      factors: trust.factors,
    };
  }

  return {
    strictness: riskScore >= 75 ? "strict" : "elevated",
    reason: `Agent trust score ${trust.score} (${trust.profile})`,
    score: trust.score,
    profile: trust.profile,
    factors: trust.factors,
  };
}
