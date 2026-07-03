export interface FileInfo {
    filename: string;
    additions?: number;
    deletions?: number;
    changes: number;
    patch?: string;
}
export interface RiskFactorResult {
    type: string;
    score: number;
    detail?: Record<string, unknown>;
}
export interface SensitivityConfig {
    high: string[];
    medium: string[];
    low: string[];
}
export interface RiskProfileMatchDef {
    files_include: string[];
    files_exclude: string[];
    min_files?: number;
    max_files?: number;
}
export interface RiskProfileDef {
    name?: string;
    match: RiskProfileMatchDef;
    weights: Record<string, number>;
}
export interface RiskConfig {
    sensitivity?: SensitivityConfig;
    weights?: Record<string, number>;
    ignore?: string[];
    profiles?: RiskProfileDef[];
    /** Extra globs treated as non-source for sensitive_files + test_coverage (not file_count). */
    non_source_globs?: string[];
    /** When mode=metadata, selected size factors stay visible but leave the blocking risk average. */
    size_factors?: {
        mode?: "risk" | "metadata";
        factors?: string[];
    };
}
export interface SecurityAlertCounts {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
    topRules?: string[];
}
export interface DeploymentOutcomeSummary {
    recentFailures: number;
    recentTotal: number;
    lastDeployFailed: boolean;
    lastRollback: boolean;
}
export declare const TEST_FILE_PATTERN: RegExp;
export declare const NON_SOURCE_PATTERN: RegExp;
export declare const SENSITIVE_PATTERNS: RegExp[];
export declare const DEPENDENCY_FILES: RegExp[];
export declare const FACTOR_WEIGHTS: Record<string, number>;
export declare const DEFAULT_SIZE_FACTOR_TYPES: string[];
export declare function matchesGlobs(filename: string, patterns: string[]): boolean;
export declare function matchRiskProfile(filenames: string[], profiles: RiskProfileDef[]): RiskProfileDef | null;
export declare function isTestFile(filename: string): boolean;
export declare function isNonSourceFile(filename: string): boolean;
export declare function isWorkflowFile(filename: string): boolean;
/** Non-source for risk-factor purposes (markdown, config, consumer-declared globs). */
export declare function isContentNonSource(filename: string, config?: RiskConfig | null): boolean;
export declare function isTestableSourceFile(filename: string, config?: RiskConfig | null): boolean;
export declare function isSensitiveFile(filename: string, config?: RiskConfig | null): boolean;
export declare function riskConfigFromRepo(repo?: {
    sensitivity?: SensitivityConfig;
    weights?: Record<string, number>;
    ignore?: string[];
    profiles?: RiskProfileDef[];
    risk?: {
        non_source_globs?: string[];
        size_factors?: {
            mode?: "risk" | "metadata";
            factors?: string[];
        };
    };
} | null): RiskConfig | null;
export declare function sizeFactorsAreMetadata(config?: RiskConfig | null): boolean;
export declare function configuredSizeFactorTypes(config?: RiskConfig | null): Set<string>;
export declare function splitSizeFactors(factors: RiskFactorResult[], config?: RiskConfig | null): {
    riskFactors: RiskFactorResult[];
    sizeFactors: RiskFactorResult[];
    sizeFactorsAsMetadata: boolean;
};
export declare function sensitivityWeight(filename: string, config?: RiskConfig | null): number;
export declare function weightedAverageScores(factors: RiskFactorResult[], overrides?: Record<string, number>): number;
export declare function computeRiskScore(files: FileInfo[], config?: RiskConfig | null): {
    score: number;
    factors: RiskFactorResult[];
    sizeScore?: number;
    sizeFactors?: RiskFactorResult[];
};
export declare function detectDependencyChanges(files: FileInfo[]): RiskFactorResult | null;
export declare function computeSecurityFactor(alerts: SecurityAlertCounts): RiskFactorResult | null;
export declare function computeDeploymentHistoryFactor(outcomes: DeploymentOutcomeSummary): RiskFactorResult | null;
export interface FreezeWindowDef {
    days: string[];
    afterHour?: number;
    beforeHour?: number;
    timezone?: string;
    message?: string;
}
export declare function isInFreezeWindow(freezes: FreezeWindowDef[], now?: Date): {
    frozen: boolean;
    message?: string;
};
export type GateDecisionValue = "allow" | "warn" | "block";
export declare function decideGate(riskScore: number, healthScore: number, blockThreshold: number, warnThreshold?: number): GateDecisionValue;
/**
 * GATE-3 (2b): critical-factor hard-escalation for sensitive_files.
 *
 * The final risk score is a weighted AVERAGE, so a single critical factor can be
 * diluted by clean ones. Most genuinely-critical conditions (destructive SQL,
 * supply-chain critical vulns, prompt injection, CI/workflow integrity) already
 * bypass the average via forceBlock. `sensitive_files` did NOT — a change touching
 * auth/payment/infra-critical files (score up to 100) only fed the average.
 *
 * This escalates it OUT of the average: at/above the threshold it forces at least
 * a warn (mode: "warn", the soak default) or a block (mode: "block"). Scoped to
 * the sensitive_files factor by design — the noisy factors (file_count, code_churn,
 * test_coverage, external deps, mock/placeholder) must never escalate.
 */
export declare function decideSensitiveFilesEscalation(factors: Pick<RiskFactorResult, "type" | "score">[], cfg?: {
    enabled?: boolean;
    mode?: "warn" | "block";
    threshold?: number;
} | null): {
    block: boolean;
    warn: boolean;
    reason: string | null;
};
export declare function isRollback(prTitle: string): boolean;
