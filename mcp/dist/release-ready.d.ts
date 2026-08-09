import type { CiCheck, CiSummary, GateDecision, GateEvaluation, GateMode } from "./types.js";
/**
 * ADR-011 §2: the disposition, once resolved, is the axis that decides whether a
 * red input blocks the release. Checks with no disposition — no `input_relevance`
 * config, an externally-built CiSummary, or a stored pre-ADR-011 evaluation —
 * fall back to `required`, which is byte-for-byte the pre-ADR-011 behavior
 * (the default mapping is required -> blocking, non-required -> advisory).
 */
export declare function checkCountsTowardBlocking(check: CiCheck): boolean;
export interface ReleaseReadyInput {
    gateMode: GateMode;
    gateDecision: GateDecision;
    riskScore: number;
    riskThreshold: number;
    healthScore: number;
    healthChecksConfigured: boolean;
    ciSummary?: CiSummary | null;
    freezeActive: boolean;
    freezeMessage?: string;
    policyFindings?: string[];
    requireSecurityClear?: boolean;
    securityBlocked?: boolean;
}
export interface ReleaseReadyResult {
    releaseReady: boolean;
    reasons: string[];
}
/**
 * Composite release readiness decision (ADR-006).
 */
export declare function computeReleaseReady(input: ReleaseReadyInput): ReleaseReadyResult;
export declare function applyReleaseReadyToEvaluation(evaluation: GateEvaluation, result: ReleaseReadyResult, gateMode: GateMode): GateEvaluation;
export declare function checkConclusionForEvaluation(evaluation: GateEvaluation): "success" | "neutral" | "failure";
export declare function shouldBlockMerge(evaluation: GateEvaluation): boolean;
export declare function resolveCheckName(gateMode: GateMode, configuredName?: string): string;
