export interface CiIntegrityFile {
    filename: string;
    additions?: number;
    deletions?: number;
    patch?: string;
}
export interface CiIntegrityResult {
    score: number;
    blockingPatterns: string[];
    warningSignals: string[];
}
export interface OrTrueSuppressionRule {
    id: string;
    category: "cleanup" | "idempotent_ensure" | "count_fallback";
    /** One-line review rationale; this list is policy data, not scanner control flow. */
    justification: string;
    wrapper: "command" | "trap";
    commandPattern: RegExp;
}
/**
 * ADR-012 D4: reviewed command shapes whose non-zero exit does not carry the
 * workflow's test/build/deploy/verification outcome. Matching is deliberately
 * full-line and fail-closed (see `suppressedCommand`); adding a benign shape is
 * a data review, while every unlisted `|| true` remains blocking.
 */
export declare const OR_TRUE_SUPPRESSION_ALLOWLIST: readonly OrTrueSuppressionRule[];
export declare function isAllowedOrTrueSuppression(line: string): boolean;
/** Detect newly introduced CI bypasses, never unchanged or deleted context. */
export declare function detectCiIntegrity(files: CiIntegrityFile[]): CiIntegrityResult;
