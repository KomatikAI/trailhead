import { z } from "zod";
export declare const AGENT_TRUST_METRICS_SCHEMA: "trailhead.agent_trust_metrics.v1";
export declare const DEFAULT_TRUST_COLLECTOR_CONFIG: {
    readonly windowDays: 30;
    readonly minEvidenceEvaluations: 5;
    /** Minimum std-dev on gate penalty total_score to treat distribution as informative. */
    readonly minScoreStdDev: 1;
    /** Gate penalty total_score at or below this is "clean" (lower = cleaner). */
    readonly cleanPenaltyThreshold: 1;
    /** Gate penalty total_score at or above this is "noisy". */
    readonly noisyPenaltyThreshold: 3;
};
export type TrustCollectorConfig = typeof DEFAULT_TRUST_COLLECTOR_CONFIG;
export declare const PenaltyQualitySignalSchema: z.ZodObject<{
    mean: z.ZodNumber;
    stdDev: z.ZodNumber;
    cleanRate: z.ZodNumber;
    sampleCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    mean: number;
    stdDev: number;
    cleanRate: number;
    sampleCount: number;
}, {
    mean: number;
    stdDev: number;
    cleanRate: number;
    sampleCount: number;
}>;
export type PenaltyQualitySignal = z.infer<typeof PenaltyQualitySignalSchema>;
export declare const TrustFeedbackCountsSchema: z.ZodObject<{
    ciFailures: z.ZodOptional<z.ZodNumber>;
    reverts: z.ZodOptional<z.ZodNumber>;
    humanReview: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    ciFailures?: number | undefined;
    reverts?: number | undefined;
    humanReview?: number | undefined;
}, {
    ciFailures?: number | undefined;
    reverts?: number | undefined;
    humanReview?: number | undefined;
}>;
export type TrustFeedbackCounts = z.infer<typeof TrustFeedbackCountsSchema>;
export declare const AgentTrustMetricsSchema: z.ZodObject<{
    evaluations: z.ZodNumber;
    releaseReadyCount: z.ZodDefault<z.ZodNumber>;
    revertCount: z.ZodDefault<z.ZodNumber>;
    humanReviewRequiredCount: z.ZodDefault<z.ZodNumber>;
    policyViolationCount: z.ZodDefault<z.ZodNumber>;
    sensitivePathViolationCount: z.ZodDefault<z.ZodNumber>;
    remediationRoundsToReady: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
    penaltyQuality: z.ZodOptional<z.ZodObject<{
        mean: z.ZodNumber;
        stdDev: z.ZodNumber;
        cleanRate: z.ZodNumber;
        sampleCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        mean: number;
        stdDev: number;
        cleanRate: number;
        sampleCount: number;
    }, {
        mean: number;
        stdDev: number;
        cleanRate: number;
        sampleCount: number;
    }>>;
    feedback: z.ZodOptional<z.ZodObject<{
        ciFailures: z.ZodOptional<z.ZodNumber>;
        reverts: z.ZodOptional<z.ZodNumber>;
        humanReview: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    }, {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    evaluations: number;
    releaseReadyCount: number;
    revertCount: number;
    humanReviewRequiredCount: number;
    policyViolationCount: number;
    sensitivePathViolationCount: number;
    remediationRoundsToReady: number[];
    penaltyQuality?: {
        mean: number;
        stdDev: number;
        cleanRate: number;
        sampleCount: number;
    } | undefined;
    feedback?: {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    } | undefined;
}, {
    evaluations: number;
    releaseReadyCount?: number | undefined;
    revertCount?: number | undefined;
    humanReviewRequiredCount?: number | undefined;
    policyViolationCount?: number | undefined;
    sensitivePathViolationCount?: number | undefined;
    remediationRoundsToReady?: number[] | undefined;
    penaltyQuality?: {
        mean: number;
        stdDev: number;
        cleanRate: number;
        sampleCount: number;
    } | undefined;
    feedback?: {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    } | undefined;
}>;
export type AgentTrustMetrics = z.infer<typeof AgentTrustMetricsSchema>;
export declare const ScoreDistributionSchema: z.ZodObject<{
    count: z.ZodNumber;
    mean: z.ZodNumber;
    stdDev: z.ZodNumber;
    min: z.ZodNumber;
    max: z.ZodNumber;
    hasVariance: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    mean: number;
    stdDev: number;
    count: number;
    min: number;
    max: number;
    hasVariance: boolean;
}, {
    mean: number;
    stdDev: number;
    count: number;
    min: number;
    max: number;
    hasVariance: boolean;
}>;
export type ScoreDistribution = z.infer<typeof ScoreDistributionSchema>;
export declare const AgentTrustColdStartSchema: z.ZodObject<{
    emitTrust: z.ZodBoolean;
    reason: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    emitTrust: boolean;
    reason: string | null;
}, {
    emitTrust: boolean;
    reason: string | null;
}>;
export type AgentTrustColdStart = z.infer<typeof AgentTrustColdStartSchema>;
export declare const AgentTrustEnvelopeSchema: z.ZodObject<{
    schema: z.ZodLiteral<"trailhead.agent_trust_metrics.v1">;
    agent_id: z.ZodString;
    collected_at: z.ZodString;
    window_days: z.ZodNumber;
    trust: z.ZodNullable<z.ZodObject<{
        evaluations: z.ZodNumber;
        releaseReadyCount: z.ZodDefault<z.ZodNumber>;
        revertCount: z.ZodDefault<z.ZodNumber>;
        humanReviewRequiredCount: z.ZodDefault<z.ZodNumber>;
        policyViolationCount: z.ZodDefault<z.ZodNumber>;
        sensitivePathViolationCount: z.ZodDefault<z.ZodNumber>;
        remediationRoundsToReady: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        penaltyQuality: z.ZodOptional<z.ZodObject<{
            mean: z.ZodNumber;
            stdDev: z.ZodNumber;
            cleanRate: z.ZodNumber;
            sampleCount: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            mean: number;
            stdDev: number;
            cleanRate: number;
            sampleCount: number;
        }, {
            mean: number;
            stdDev: number;
            cleanRate: number;
            sampleCount: number;
        }>>;
        feedback: z.ZodOptional<z.ZodObject<{
            ciFailures: z.ZodOptional<z.ZodNumber>;
            reverts: z.ZodOptional<z.ZodNumber>;
            humanReview: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            ciFailures?: number | undefined;
            reverts?: number | undefined;
            humanReview?: number | undefined;
        }, {
            ciFailures?: number | undefined;
            reverts?: number | undefined;
            humanReview?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        evaluations: number;
        releaseReadyCount: number;
        revertCount: number;
        humanReviewRequiredCount: number;
        policyViolationCount: number;
        sensitivePathViolationCount: number;
        remediationRoundsToReady: number[];
        penaltyQuality?: {
            mean: number;
            stdDev: number;
            cleanRate: number;
            sampleCount: number;
        } | undefined;
        feedback?: {
            ciFailures?: number | undefined;
            reverts?: number | undefined;
            humanReview?: number | undefined;
        } | undefined;
    }, {
        evaluations: number;
        releaseReadyCount?: number | undefined;
        revertCount?: number | undefined;
        humanReviewRequiredCount?: number | undefined;
        policyViolationCount?: number | undefined;
        sensitivePathViolationCount?: number | undefined;
        remediationRoundsToReady?: number[] | undefined;
        penaltyQuality?: {
            mean: number;
            stdDev: number;
            cleanRate: number;
            sampleCount: number;
        } | undefined;
        feedback?: {
            ciFailures?: number | undefined;
            reverts?: number | undefined;
            humanReview?: number | undefined;
        } | undefined;
    }>>;
    cold_start: z.ZodObject<{
        emitTrust: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        emitTrust: boolean;
        reason: string | null;
    }, {
        emitTrust: boolean;
        reason: string | null;
    }>;
    distribution: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        count: z.ZodNumber;
        mean: z.ZodNumber;
        stdDev: z.ZodNumber;
        min: z.ZodNumber;
        max: z.ZodNumber;
        hasVariance: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        mean: number;
        stdDev: number;
        count: number;
        min: number;
        max: number;
        hasVariance: boolean;
    }, {
        mean: number;
        stdDev: number;
        count: number;
        min: number;
        max: number;
        hasVariance: boolean;
    }>>>;
    feedback: z.ZodOptional<z.ZodObject<{
        ciFailures: z.ZodOptional<z.ZodNumber>;
        reverts: z.ZodOptional<z.ZodNumber>;
        humanReview: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    }, {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    schema: "trailhead.agent_trust_metrics.v1";
    agent_id: string;
    collected_at: string;
    window_days: number;
    trust: {
        evaluations: number;
        releaseReadyCount: number;
        revertCount: number;
        humanReviewRequiredCount: number;
        policyViolationCount: number;
        sensitivePathViolationCount: number;
        remediationRoundsToReady: number[];
        penaltyQuality?: {
            mean: number;
            stdDev: number;
            cleanRate: number;
            sampleCount: number;
        } | undefined;
        feedback?: {
            ciFailures?: number | undefined;
            reverts?: number | undefined;
            humanReview?: number | undefined;
        } | undefined;
    } | null;
    cold_start: {
        emitTrust: boolean;
        reason: string | null;
    };
    feedback?: {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    } | undefined;
    distribution?: {
        mean: number;
        stdDev: number;
        count: number;
        min: number;
        max: number;
        hasVariance: boolean;
    } | null | undefined;
}, {
    schema: "trailhead.agent_trust_metrics.v1";
    agent_id: string;
    collected_at: string;
    window_days: number;
    trust: {
        evaluations: number;
        releaseReadyCount?: number | undefined;
        revertCount?: number | undefined;
        humanReviewRequiredCount?: number | undefined;
        policyViolationCount?: number | undefined;
        sensitivePathViolationCount?: number | undefined;
        remediationRoundsToReady?: number[] | undefined;
        penaltyQuality?: {
            mean: number;
            stdDev: number;
            cleanRate: number;
            sampleCount: number;
        } | undefined;
        feedback?: {
            ciFailures?: number | undefined;
            reverts?: number | undefined;
            humanReview?: number | undefined;
        } | undefined;
    } | null;
    cold_start: {
        emitTrust: boolean;
        reason: string | null;
    };
    feedback?: {
        ciFailures?: number | undefined;
        reverts?: number | undefined;
        humanReview?: number | undefined;
    } | undefined;
    distribution?: {
        mean: number;
        stdDev: number;
        count: number;
        min: number;
        max: number;
        hasVariance: boolean;
    } | null | undefined;
}>;
export type AgentTrustEnvelope = z.infer<typeof AgentTrustEnvelopeSchema>;
export declare function computeScoreDistribution(scores: number[], options?: {
    minScoreStdDev?: number;
}): ScoreDistribution | null;
export declare function assessColdStart(params: {
    evaluations: number;
    distribution?: ScoreDistribution | null;
    blockedCount?: number;
    warnedCount?: number;
    feedback?: TrustFeedbackCounts | null;
    config?: Partial<TrustCollectorConfig>;
}): AgentTrustColdStart;
export declare function assessColdStartFromMetrics(metrics: AgentTrustMetrics, config?: Partial<TrustCollectorConfig>): AgentTrustColdStart;
export declare function parseAgentTrustMetricsObject(raw: unknown): AgentTrustMetrics | null;
export declare function parseAgentTrustMetrics(raw: string | undefined): AgentTrustMetrics | null;
export declare function createEmptyAgentTrustMetrics(): AgentTrustMetrics;
