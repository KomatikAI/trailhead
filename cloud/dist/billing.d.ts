export type PlanTier = "free" | "pro" | "team";
export interface PlanDefinition {
    id: PlanTier;
    name: string;
    evaluationsPerMonth: number;
    cloudStore: boolean;
    dashboard: boolean;
    orgRollup: boolean;
    apiKeys: boolean;
    sso: boolean;
    seatsIncluded: number;
}
export declare const PLANS: Record<PlanTier, PlanDefinition>;
export declare function monthKey(date?: Date): string;
export declare function quotaHeaders(plan: PlanTier, used: number): Record<string, string>;
export declare function canIngestEvaluation(plan: PlanTier, used: number): boolean;
/**
 * Soft-launch quota multiplier: over-quota ingest is still stored (200 +
 * `X-Trailhead-Quota-Exceeded`) up to HARD_LIMIT_MULTIPLIER × the tier limit,
 * then hard-stopped (429). Fail-closed abuse backstop (komatik lesson).
 */
export declare const HARD_LIMIT_MULTIPLIER = 3;
export interface QuotaEvaluation {
    /** Plan permits the cloud store at all (free = false). */
    planAllowsCloud: boolean;
    /** Ingest should be persisted (stored even when soft over-quota). */
    store: boolean;
    /** At or beyond the monthly tier limit (soft over-quota). */
    overQuota: boolean;
    /** At or beyond HARD_LIMIT_MULTIPLIER × limit — reject (429). */
    hardLimited: boolean;
}
/**
 * Decide how to treat an ingest given the org's plan and its usage BEFORE this
 * evaluation is counted. Encodes the v1 soft-launch quota semantics.
 */
export declare function evaluateQuota(plan: PlanTier, usedBeforeInsert: number): QuotaEvaluation;
/** sha256 hex of the full API key. PLAINTEXT IS NEVER STORED (contract). */
export declare function hashApiKey(key: string): string;
export declare function maskApiKey(key: string): string;
export declare function generateApiKey(): string;
