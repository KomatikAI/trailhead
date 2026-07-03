// Phase B3 — dynamic agent trust scoring (pure module).
import { assessColdStartFromMetrics, DEFAULT_TRUST_COLLECTOR_CONFIG, } from "./agent-trust-metrics.js";
const WEIGHTS = {
    release_ready_rate: 0.3,
    revert_resistance: 0.2,
    human_free_rate: 0.2,
    remediation_efficiency: 0.15,
    policy_violation_penalty: 0.075,
    sensitive_path_penalty: 0.075,
    penalty_mean_quality: 0.05,
};
function rate(numerator, denominator) {
    if (denominator <= 0)
        return 0;
    return numerator / denominator;
}
function remediationEfficiency(rounds) {
    if (rounds.length === 0)
        return 0.5;
    const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
    return Math.max(0, Math.min(1, 1 - (avg - 1) / 4));
}
function penaltyMeanQuality(penaltyQuality, noisyThreshold) {
    if (!penaltyQuality || penaltyQuality.sampleCount <= 0)
        return undefined;
    return Math.max(0, Math.min(1, 1 - penaltyQuality.mean / noisyThreshold));
}
export function computeAgentTrustScore(metrics, options) {
    const config = { ...DEFAULT_TRUST_COLLECTOR_CONFIG, ...options?.config };
    const coldStart = assessColdStartFromMetrics(metrics, config);
    if (!coldStart.emitTrust) {
        return null;
    }
    const n = Math.max(metrics.evaluations, 0);
    const releaseReadyRate = rate(metrics.releaseReadyCount, n);
    const penaltyCleanRate = metrics.penaltyQuality?.cleanRate;
    const releaseSignal = penaltyCleanRate !== undefined
        ? Math.max(releaseReadyRate, penaltyCleanRate)
        : releaseReadyRate;
    const revertRate = rate(metrics.revertCount, n);
    const humanReviewRate = rate(metrics.humanReviewRequiredCount, n);
    const policyViolationRate = rate(metrics.policyViolationCount, n);
    const sensitiveRate = rate(metrics.sensitivePathViolationCount, n);
    const remEff = remediationEfficiency(metrics.remediationRoundsToReady);
    const meanQuality = penaltyMeanQuality(metrics.penaltyQuality, config.noisyPenaltyThreshold);
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
    let score = WEIGHTS.release_ready_rate * releaseSignal +
        WEIGHTS.revert_resistance * (1 - revertRate) +
        WEIGHTS.human_free_rate * (1 - humanReviewRate) +
        WEIGHTS.remediation_efficiency * remEff -
        WEIGHTS.policy_violation_penalty * policyViolationRate -
        WEIGHTS.sensitive_path_penalty * sensitiveRate;
    if (meanQuality !== undefined) {
        score += WEIGHTS.penalty_mean_quality * meanQuality;
    }
    score = Math.max(0, Math.min(1, score));
    let profile = "standard";
    if (score >= 0.85)
        profile = "fast-track";
    else if (score < 0.6)
        profile = "probation";
    const thresholdDelta = profile === "fast-track" ? 10 : profile === "probation" ? -10 : 0;
    return {
        score: Math.round(score * 1000) / 1000,
        profile,
        factors,
        thresholdDelta,
        autofixEnabled: profile !== "probation",
    };
}
export function strictnessFromTrust(trust, riskScore) {
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
