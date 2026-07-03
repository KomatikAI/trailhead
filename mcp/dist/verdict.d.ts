import { z } from "zod";
import type { GateEvaluation, SubmissionCheckResult } from "./types.js";
import type { TrustRuntime } from "./trust-runtime.js";
import type { PenaltyQualitySignal } from "./agent-trust-metrics.js";
export declare const TRAILHEAD_VERDICT_SCHEMA: "trailhead.verdict.v1";
export declare const PENALTY_SEMANTICS: "lower_is_cleaner";
export declare const RISK_SEMANTICS: "higher_is_worse";
export declare const VerdictPenaltySchema: z.ZodObject<{
    total_score: z.ZodNumber;
    factor_scores: z.ZodRecord<z.ZodString, z.ZodNumber>;
    semantics: z.ZodLiteral<"lower_is_cleaner">;
}, "strip", z.ZodTypeAny, {
    total_score: number;
    factor_scores: Record<string, number>;
    semantics: "lower_is_cleaner";
}, {
    total_score: number;
    factor_scores: Record<string, number>;
    semantics: "lower_is_cleaner";
}>;
export type VerdictPenalty = z.infer<typeof VerdictPenaltySchema>;
export declare const VerdictRiskSchema: z.ZodObject<{
    score: z.ZodNumber;
    semantics: z.ZodLiteral<"higher_is_worse">;
    factors: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    score: number;
    factors: Record<string, number>;
    semantics: "higher_is_worse";
}, {
    score: number;
    factors: Record<string, number>;
    semantics: "higher_is_worse";
}>;
export type VerdictRisk = z.infer<typeof VerdictRiskSchema>;
export declare const VerdictTrustProfileSchema: z.ZodObject<{
    shadow: z.ZodOptional<z.ZodBoolean>;
    enforce: z.ZodOptional<z.ZodBoolean>;
    score: z.ZodOptional<z.ZodNumber>;
    profile: z.ZodOptional<z.ZodEnum<["fast-track", "standard", "probation"]>>;
    strictness: z.ZodEnum<["baseline", "elevated", "strict"]>;
    reason: z.ZodString;
    factors: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    strictness: "baseline" | "elevated" | "strict";
    score?: number | undefined;
    shadow?: boolean | undefined;
    profile?: "fast-track" | "standard" | "probation" | undefined;
    factors?: Record<string, number> | undefined;
    enforce?: boolean | undefined;
}, {
    reason: string;
    strictness: "baseline" | "elevated" | "strict";
    score?: number | undefined;
    shadow?: boolean | undefined;
    profile?: "fast-track" | "standard" | "probation" | undefined;
    factors?: Record<string, number> | undefined;
    enforce?: boolean | undefined;
}>;
export type VerdictTrustProfile = z.infer<typeof VerdictTrustProfileSchema>;
export declare const VerdictRemediationSchema: z.ZodObject<{
    loop_round: z.ZodOptional<z.ZodNumber>;
    max_loop_rounds: z.ZodOptional<z.ZodNumber>;
    next_action: z.ZodOptional<z.ZodString>;
    fix_count: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    loop_round?: number | undefined;
    max_loop_rounds?: number | undefined;
    next_action?: string | undefined;
    fix_count?: number | undefined;
}, {
    loop_round?: number | undefined;
    max_loop_rounds?: number | undefined;
    next_action?: string | undefined;
    fix_count?: number | undefined;
}>;
export type VerdictRemediation = z.infer<typeof VerdictRemediationSchema>;
export declare const TrailheadVerdictSchema: z.ZodObject<{
    schema: z.ZodLiteral<"trailhead.verdict.v1">;
    evaluation_id: z.ZodString;
    repo_id: z.ZodString;
    commit_sha: z.ZodString;
    pr_number: z.ZodOptional<z.ZodNumber>;
    head_ref: z.ZodOptional<z.ZodString>;
    agent_id: z.ZodOptional<z.ZodString>;
    decision: z.ZodEnum<["allow", "warn", "block"]>;
    gate_mode: z.ZodOptional<z.ZodEnum<["risk-only", "advisory", "release-ready"]>>;
    release_ready: z.ZodOptional<z.ZodBoolean>;
    penalty: z.ZodObject<{
        total_score: z.ZodNumber;
        factor_scores: z.ZodRecord<z.ZodString, z.ZodNumber>;
        semantics: z.ZodLiteral<"lower_is_cleaner">;
    }, "strip", z.ZodTypeAny, {
        total_score: number;
        factor_scores: Record<string, number>;
        semantics: "lower_is_cleaner";
    }, {
        total_score: number;
        factor_scores: Record<string, number>;
        semantics: "lower_is_cleaner";
    }>;
    risk: z.ZodObject<{
        score: z.ZodNumber;
        semantics: z.ZodLiteral<"higher_is_worse">;
        factors: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        score: number;
        factors: Record<string, number>;
        semantics: "higher_is_worse";
    }, {
        score: number;
        factors: Record<string, number>;
        semantics: "higher_is_worse";
    }>;
    trust_profile: z.ZodOptional<z.ZodObject<{
        shadow: z.ZodOptional<z.ZodBoolean>;
        enforce: z.ZodOptional<z.ZodBoolean>;
        score: z.ZodOptional<z.ZodNumber>;
        profile: z.ZodOptional<z.ZodEnum<["fast-track", "standard", "probation"]>>;
        strictness: z.ZodEnum<["baseline", "elevated", "strict"]>;
        reason: z.ZodString;
        factors: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        shadow?: boolean | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
        enforce?: boolean | undefined;
    }, {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        shadow?: boolean | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
        enforce?: boolean | undefined;
    }>>;
    submission_checks: z.ZodArray<z.ZodObject<{
        code: z.ZodEnum<["artifact_integrity", "mock_placeholder", "context_freshness", "destructive_sql", "secrets", "path_format", "syntax_validity", "import_resolution", "rls_new_tables", "auth_route_auth", "hardcoded_env", "external_package_deps", "sql_syntax_basic", "large_file", "soul_integrity", "contract_integrity", "safe_deprecation", "destructive_change", "claim_anchoring", "promotion_coherence", "output_size_min", "action_extraction_present", "delta_section_present", "preamble_absent", "graduation_signals_section_present", "fabricated_id_check", "session_narrative_detection", "incompleteness_self_flag", "referenced_files_exist", "prerequisite_secrets_check", "dependency_dag_validation", "uncommitted_fix_check", "verification_owner_assigned", "external_interface_validation"]>;
        severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
        title: z.ZodString;
        detail: z.ZodString;
        files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files: string[];
    }, {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files?: string[] | undefined;
    }>, "many">;
    remediation: z.ZodOptional<z.ZodObject<{
        loop_round: z.ZodOptional<z.ZodNumber>;
        max_loop_rounds: z.ZodOptional<z.ZodNumber>;
        next_action: z.ZodOptional<z.ZodString>;
        fix_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        loop_round?: number | undefined;
        max_loop_rounds?: number | undefined;
        next_action?: string | undefined;
        fix_count?: number | undefined;
    }, {
        loop_round?: number | undefined;
        max_loop_rounds?: number | undefined;
        next_action?: string | undefined;
        fix_count?: number | undefined;
    }>>;
    reasons: z.ZodArray<z.ZodString, "many">;
    evaluated_at: z.ZodString;
    /** Deprecated flat fields — remove after one release (#260). */
    _legacy: z.ZodOptional<z.ZodObject<{
        riskScore: z.ZodNumber;
        healthScore: z.ZodNumber;
        releaseReadyReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        policyFindings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        healthScore: number;
        riskScore: number;
        policyFindings?: string[] | undefined;
        releaseReadyReasons?: string[] | undefined;
    }, {
        healthScore: number;
        riskScore: number;
        policyFindings?: string[] | undefined;
        releaseReadyReasons?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    schema: "trailhead.verdict.v1";
    evaluation_id: string;
    commit_sha: string;
    risk: {
        score: number;
        factors: Record<string, number>;
        semantics: "higher_is_worse";
    };
    repo_id: string;
    reasons: string[];
    decision: "allow" | "warn" | "block";
    penalty: {
        total_score: number;
        factor_scores: Record<string, number>;
        semantics: "lower_is_cleaner";
    };
    submission_checks: {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files: string[];
    }[];
    evaluated_at: string;
    agent_id?: string | undefined;
    pr_number?: number | undefined;
    head_ref?: string | undefined;
    release_ready?: boolean | undefined;
    trust_profile?: {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        shadow?: boolean | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
        enforce?: boolean | undefined;
    } | undefined;
    remediation?: {
        loop_round?: number | undefined;
        max_loop_rounds?: number | undefined;
        next_action?: string | undefined;
        fix_count?: number | undefined;
    } | undefined;
    gate_mode?: "release-ready" | "advisory" | "risk-only" | undefined;
    _legacy?: {
        healthScore: number;
        riskScore: number;
        policyFindings?: string[] | undefined;
        releaseReadyReasons?: string[] | undefined;
    } | undefined;
}, {
    schema: "trailhead.verdict.v1";
    evaluation_id: string;
    commit_sha: string;
    risk: {
        score: number;
        factors: Record<string, number>;
        semantics: "higher_is_worse";
    };
    repo_id: string;
    reasons: string[];
    decision: "allow" | "warn" | "block";
    penalty: {
        total_score: number;
        factor_scores: Record<string, number>;
        semantics: "lower_is_cleaner";
    };
    submission_checks: {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files?: string[] | undefined;
    }[];
    evaluated_at: string;
    agent_id?: string | undefined;
    pr_number?: number | undefined;
    head_ref?: string | undefined;
    release_ready?: boolean | undefined;
    trust_profile?: {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        shadow?: boolean | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
        enforce?: boolean | undefined;
    } | undefined;
    remediation?: {
        loop_round?: number | undefined;
        max_loop_rounds?: number | undefined;
        next_action?: string | undefined;
        fix_count?: number | undefined;
    } | undefined;
    gate_mode?: "release-ready" | "advisory" | "risk-only" | undefined;
    _legacy?: {
        healthScore: number;
        riskScore: number;
        policyFindings?: string[] | undefined;
        releaseReadyReasons?: string[] | undefined;
    } | undefined;
}>;
export type TrailheadVerdict = z.infer<typeof TrailheadVerdictSchema>;
export declare function computeSubmissionPenalty(checks?: SubmissionCheckResult[]): VerdictPenalty;
export declare function collectVerdictReasons(evaluation: GateEvaluation): string[];
export interface BuildGateVerdictOptions {
    evaluatedAt?: string;
    trustRuntime?: TrustRuntime;
    agentId?: string | null;
}
export declare function buildGateVerdict(evaluation: GateEvaluation, options?: BuildGateVerdictOptions): TrailheadVerdict;
export declare function parseGateVerdict(raw: string | unknown): TrailheadVerdict | null;
/** Collector helper: map penalty verdicts to trust penaltyQuality stats. */
export declare function aggregateVerdictPenaltyQuality(verdicts: TrailheadVerdict[]): PenaltyQualitySignal | null;
/** Example collector projection: one verdict → trust correlation fields. */
export declare function projectVerdictToTrustCorrelation(verdict: TrailheadVerdict): {
    evaluation_id: string;
    agent_id?: string;
    head_ref?: string;
    penalty: VerdictPenalty;
    release_ready_clean: boolean;
};
