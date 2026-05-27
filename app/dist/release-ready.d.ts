import type { CiSummary, GateDecision, GateEvaluation, GateMode } from "./types.js";
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
