// Versioned ingestion contract for dynamic agent trust (Phase B3 / epic #252).
import { z } from "zod";
export const AGENT_TRUST_METRICS_SCHEMA = "trailhead.agent_trust_metrics.v1";
export const DEFAULT_TRUST_COLLECTOR_CONFIG = {
    windowDays: 30,
    minEvidenceEvaluations: 5,
    /** Minimum std-dev on gate penalty total_score to treat distribution as informative. */
    minScoreStdDev: 1,
    /** Gate penalty total_score at or below this is "clean" (lower = cleaner). */
    cleanPenaltyThreshold: 1,
    /** Gate penalty total_score at or above this is "noisy". */
    noisyPenaltyThreshold: 3,
};
export const PenaltyQualitySignalSchema = z.object({
    mean: z.number().describe("Mean gate penalty total_score (lower = cleaner)"),
    stdDev: z.number().min(0),
    cleanRate: z.number().min(0).max(1),
    sampleCount: z.number().int().min(0),
});
export const TrustFeedbackCountsSchema = z.object({
    ciFailures: z.number().int().min(0).optional(),
    reverts: z.number().int().min(0).optional(),
    humanReview: z.number().int().min(0).optional(),
});
export const AgentTrustMetricsSchema = z.object({
    evaluations: z.number().int().min(0),
    releaseReadyCount: z.number().int().min(0).default(0),
    revertCount: z.number().int().min(0).default(0),
    humanReviewRequiredCount: z.number().int().min(0).default(0),
    policyViolationCount: z.number().int().min(0).default(0),
    sensitivePathViolationCount: z.number().int().min(0).default(0),
    remediationRoundsToReady: z.array(z.number().int().min(0)).default([]),
    penaltyQuality: PenaltyQualitySignalSchema.optional(),
    feedback: TrustFeedbackCountsSchema.optional(),
});
export const ScoreDistributionSchema = z.object({
    count: z.number().int().min(0),
    mean: z.number(),
    stdDev: z.number().min(0),
    min: z.number(),
    max: z.number(),
    hasVariance: z.boolean(),
});
export const AgentTrustColdStartSchema = z.object({
    emitTrust: z.boolean(),
    reason: z.string().nullable(),
});
export const AgentTrustEnvelopeSchema = z.object({
    schema: z.literal(AGENT_TRUST_METRICS_SCHEMA),
    agent_id: z.string(),
    collected_at: z.string(),
    window_days: z.number().int().min(1),
    trust: AgentTrustMetricsSchema.nullable(),
    cold_start: AgentTrustColdStartSchema,
    distribution: ScoreDistributionSchema.nullable().optional(),
    feedback: TrustFeedbackCountsSchema.optional(),
});
export function computeScoreDistribution(scores, options = {}) {
    const minScoreStdDev = options.minScoreStdDev ?? DEFAULT_TRUST_COLLECTOR_CONFIG.minScoreStdDev;
    const values = scores.filter((s) => typeof s === "number" && !Number.isNaN(s));
    if (values.length === 0)
        return null;
    const count = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance = count === 1 ? 0 : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);
    return {
        count,
        mean: Math.round(mean * 10) / 10,
        stdDev: Math.round(stdDev * 10) / 10,
        min: Math.min(...values),
        max: Math.max(...values),
        hasVariance: stdDev >= minScoreStdDev,
    };
}
export function assessColdStart(params) {
    const config = { ...DEFAULT_TRUST_COLLECTOR_CONFIG, ...params.config };
    const feedback = params.feedback ?? null;
    const feedbackEvaluations = (feedback?.ciFailures ?? 0) + (feedback?.reverts ?? 0) + (feedback?.humanReview ?? 0);
    const totalEvidence = params.evaluations + feedbackEvaluations;
    if (totalEvidence < config.minEvidenceEvaluations) {
        return {
            emitTrust: false,
            reason: `insufficient_evaluations (${totalEvidence} < ${config.minEvidenceEvaluations})`,
        };
    }
    const hasOutcomeVariance = (params.blockedCount ?? 0) > 0 ||
        (params.warnedCount ?? 0) > 0 ||
        (feedback?.reverts ?? 0) > 0 ||
        (feedback?.ciFailures ?? 0) > 0 ||
        (feedback?.humanReview ?? 0) > 0 ||
        params.distribution?.hasVariance === true ||
        (params.distribution?.stdDev ?? 0) >= config.minScoreStdDev;
    if (!hasOutcomeVariance) {
        return {
            emitTrust: false,
            reason: "flat_signals (no outcome variance and no penalty distribution variance)",
        };
    }
    return { emitTrust: true, reason: null };
}
export function assessColdStartFromMetrics(metrics, config) {
    const mergedConfig = { ...DEFAULT_TRUST_COLLECTOR_CONFIG, ...config };
    const feedbackEvidence = (metrics.feedback?.ciFailures ?? 0) +
        (metrics.feedback?.reverts ?? 0) +
        (metrics.feedback?.humanReview ?? 0);
    const totalEvidence = metrics.evaluations + feedbackEvidence;
    if (totalEvidence < mergedConfig.minEvidenceEvaluations) {
        return {
            emitTrust: false,
            reason: `insufficient_evaluations (${totalEvidence} < ${mergedConfig.minEvidenceEvaluations})`,
        };
    }
    const penaltyVariance = (metrics.penaltyQuality?.stdDev ?? 0) >= mergedConfig.minScoreStdDev;
    const hasOutcomeVariance = metrics.revertCount > 0 ||
        metrics.humanReviewRequiredCount > 0 ||
        metrics.policyViolationCount > 0 ||
        metrics.sensitivePathViolationCount > 0 ||
        penaltyVariance ||
        feedbackEvidence > 0 ||
        (metrics.releaseReadyCount > 0 && metrics.releaseReadyCount < metrics.evaluations);
    if (!hasOutcomeVariance) {
        return {
            emitTrust: false,
            reason: "flat_signals (no outcome variance and no penalty distribution variance)",
        };
    }
    return { emitTrust: true, reason: null };
}
export function parseAgentTrustMetricsObject(raw) {
    const parsed = AgentTrustMetricsSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}
export function parseAgentTrustMetrics(raw) {
    if (!raw?.trim())
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed &&
            typeof parsed === "object" &&
            "schema" in parsed &&
            parsed.schema === AGENT_TRUST_METRICS_SCHEMA) {
            const envelope = AgentTrustEnvelopeSchema.safeParse(parsed);
            if (!envelope.success || !envelope.data.trust)
                return null;
            return envelope.data.trust;
        }
        return parseAgentTrustMetricsObject(parsed);
    }
    catch {
        return null;
    }
}
export function createEmptyAgentTrustMetrics() {
    return {
        evaluations: 0,
        releaseReadyCount: 0,
        revertCount: 0,
        humanReviewRequiredCount: 0,
        policyViolationCount: 0,
        sensitivePathViolationCount: 0,
        remediationRoundsToReady: [],
    };
}
