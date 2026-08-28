import { z } from "zod";
import type { CiManifest } from "./ci-manifest.js";
export declare const GateDecision: z.ZodEnum<["allow", "warn", "block"]>;
export type GateDecision = z.infer<typeof GateDecision>;
export declare const HealthCheckResult: z.ZodObject<{
    target: z.ZodString;
    status: z.ZodEnum<["allow", "warn", "block"]>;
    latencyMs: z.ZodNumber;
    detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: "allow" | "warn" | "block";
    target: string;
    latencyMs: number;
    detail?: Record<string, unknown> | undefined;
}, {
    status: "allow" | "warn" | "block";
    target: string;
    latencyMs: number;
    detail?: Record<string, unknown> | undefined;
}>;
export type HealthCheckResult = z.infer<typeof HealthCheckResult>;
export declare const RiskFactor: z.ZodObject<{
    type: z.ZodEnum<["code_churn", "test_coverage", "file_count", "sensitive_files", "author_history", "dependency_changes", "pr_age", "security_alerts", "deployment_history", "canary_status", "ci_integrity", "workflow_security", "prompt_injection_risk", "supply_chain", "pr_scope", "duplicate_logic", "cross_repo_impact"]>;
    score: z.ZodNumber;
    detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
    score: number;
    detail?: Record<string, unknown> | undefined;
}, {
    type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
    score: number;
    detail?: Record<string, unknown> | undefined;
}>;
export type RiskFactor = z.infer<typeof RiskFactor>;
export declare const PrProvenance: z.ZodObject<{
    type: z.ZodEnum<["human", "dependabot", "copilot", "codex", "claude", "custom-bot", "unknown"]>;
    confidence: z.ZodNumber;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
    confidence: number;
    source?: string | undefined;
}, {
    type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
    confidence: number;
    source?: string | undefined;
}>;
export type PrProvenance = z.infer<typeof PrProvenance>;
export declare const GateMode: z.ZodEnum<["release-ready", "advisory", "risk-only"]>;
export type GateMode = z.infer<typeof GateMode>;
export declare const AgentBriefMode: z.ZodEnum<["off", "collapsed", "expanded"]>;
export type AgentBriefMode = z.infer<typeof AgentBriefMode>;
export declare const CiCheckStatusEnum: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
export type CiCheckStatusEnum = z.infer<typeof CiCheckStatusEnum>;
export declare const InputDispositionKind: z.ZodEnum<["blocking", "advisory", "irrelevant", "missing_blocking"]>;
export type InputDispositionKind = z.infer<typeof InputDispositionKind>;
export declare const InputDisposition: z.ZodObject<{
    kind: z.ZodEnum<["blocking", "advisory", "irrelevant", "missing_blocking"]>;
    reason: z.ZodOptional<z.ZodString>;
    /** `policy` = an input_relevance entry matched; `default` = required/optional fallback. */
    source: z.ZodEnum<["policy", "default"]>;
}, "strip", z.ZodTypeAny, {
    source: "policy" | "default";
    kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
    reason?: string | undefined;
}, {
    source: "policy" | "default";
    kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
    reason?: string | undefined;
}>;
export type InputDisposition = z.infer<typeof InputDisposition>;
export declare const CiCheck: z.ZodObject<{
    name: z.ZodString;
    status: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
    conclusion: z.ZodOptional<z.ZodString>;
    detailsUrl: z.ZodOptional<z.ZodString>;
    required: z.ZodBoolean;
    disposition: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<["blocking", "advisory", "irrelevant", "missing_blocking"]>;
        reason: z.ZodOptional<z.ZodString>;
        /** `policy` = an input_relevance entry matched; `default` = required/optional fallback. */
        source: z.ZodEnum<["policy", "default"]>;
    }, "strip", z.ZodTypeAny, {
        source: "policy" | "default";
        kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
        reason?: string | undefined;
    }, {
        source: "policy" | "default";
        kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
        reason?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
    name: string;
    required: boolean;
    conclusion?: string | undefined;
    detailsUrl?: string | undefined;
    disposition?: {
        source: "policy" | "default";
        kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
        reason?: string | undefined;
    } | undefined;
}, {
    status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
    name: string;
    required: boolean;
    conclusion?: string | undefined;
    detailsUrl?: string | undefined;
    disposition?: {
        source: "policy" | "default";
        kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
        reason?: string | undefined;
    } | undefined;
}>;
export type CiCheck = z.infer<typeof CiCheck>;
export declare const CiSummary: z.ZodObject<{
    checks: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        status: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
        conclusion: z.ZodOptional<z.ZodString>;
        detailsUrl: z.ZodOptional<z.ZodString>;
        required: z.ZodBoolean;
        disposition: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<["blocking", "advisory", "irrelevant", "missing_blocking"]>;
            reason: z.ZodOptional<z.ZodString>;
            /** `policy` = an input_relevance entry matched; `default` = required/optional fallback. */
            source: z.ZodEnum<["policy", "default"]>;
        }, "strip", z.ZodTypeAny, {
            source: "policy" | "default";
            kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
            reason?: string | undefined;
        }, {
            source: "policy" | "default";
            kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
        name: string;
        required: boolean;
        conclusion?: string | undefined;
        detailsUrl?: string | undefined;
        disposition?: {
            source: "policy" | "default";
            kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
            reason?: string | undefined;
        } | undefined;
    }, {
        status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
        name: string;
        required: boolean;
        conclusion?: string | undefined;
        detailsUrl?: string | undefined;
        disposition?: {
            source: "policy" | "default";
            kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
            reason?: string | undefined;
        } | undefined;
    }>, "many">;
    allRequiredPassed: z.ZodBoolean;
    pendingCount: z.ZodNumber;
    failedCount: z.ZodNumber;
    missingCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    checks: {
        status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
        name: string;
        required: boolean;
        conclusion?: string | undefined;
        detailsUrl?: string | undefined;
        disposition?: {
            source: "policy" | "default";
            kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
            reason?: string | undefined;
        } | undefined;
    }[];
    allRequiredPassed: boolean;
    pendingCount: number;
    failedCount: number;
    missingCount: number;
}, {
    checks: {
        status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
        name: string;
        required: boolean;
        conclusion?: string | undefined;
        detailsUrl?: string | undefined;
        disposition?: {
            source: "policy" | "default";
            kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
            reason?: string | undefined;
        } | undefined;
    }[];
    allRequiredPassed: boolean;
    pendingCount: number;
    failedCount: number;
    missingCount: number;
}>;
export type CiSummary = z.infer<typeof CiSummary>;
export declare const MatchedContext: z.ZodObject<{
    name: z.ZodString;
    environment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    environment?: string | undefined;
}, {
    name: string;
    environment?: string | undefined;
}>;
export type MatchedContext = z.infer<typeof MatchedContext>;
export declare const RemediationSeverity: z.ZodEnum<["blocking", "warn", "advisory"]>;
export type RemediationSeverity = z.infer<typeof RemediationSeverity>;
export declare const SubmissionCheckCode: z.ZodEnum<["artifact_integrity", "mock_placeholder", "context_freshness", "destructive_sql", "secrets", "path_format", "syntax_validity", "import_resolution", "rls_new_tables", "auth_route_auth", "hardcoded_env", "external_package_deps", "sql_syntax_basic", "large_file", "soul_integrity", "contract_integrity", "safe_deprecation", "destructive_change", "claim_anchoring", "promotion_coherence", "output_size_min", "action_extraction_present", "delta_section_present", "preamble_absent", "graduation_signals_section_present", "fabricated_id_check", "session_narrative_detection", "incompleteness_self_flag", "referenced_files_exist", "prerequisite_secrets_check", "dependency_dag_validation", "uncommitted_fix_check", "verification_owner_assigned", "external_interface_validation", "close_on_ship_link"]>;
export type SubmissionCheckCode = z.infer<typeof SubmissionCheckCode>;
export declare const SubmissionCheckResult: z.ZodObject<{
    code: z.ZodEnum<["artifact_integrity", "mock_placeholder", "context_freshness", "destructive_sql", "secrets", "path_format", "syntax_validity", "import_resolution", "rls_new_tables", "auth_route_auth", "hardcoded_env", "external_package_deps", "sql_syntax_basic", "large_file", "soul_integrity", "contract_integrity", "safe_deprecation", "destructive_change", "claim_anchoring", "promotion_coherence", "output_size_min", "action_extraction_present", "delta_section_present", "preamble_absent", "graduation_signals_section_present", "fabricated_id_check", "session_narrative_detection", "incompleteness_self_flag", "referenced_files_exist", "prerequisite_secrets_check", "dependency_dag_validation", "uncommitted_fix_check", "verification_owner_assigned", "external_interface_validation", "close_on_ship_link"]>;
    severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
    title: z.ZodString;
    detail: z.ZodString;
    files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    suggested_action: z.ZodOptional<z.ZodString>;
    autofix_eligible: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation" | "close_on_ship_link";
    detail: string;
    severity: "warn" | "advisory" | "blocking";
    title: string;
    files: string[];
    autofix_eligible: boolean;
    suggested_action?: string | undefined;
}, {
    code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation" | "close_on_ship_link";
    detail: string;
    severity: "warn" | "advisory" | "blocking";
    title: string;
    files?: string[] | undefined;
    suggested_action?: string | undefined;
    autofix_eligible?: boolean | undefined;
}>;
export type SubmissionCheckResult = z.infer<typeof SubmissionCheckResult>;
export declare const RemediationAutofixClass: z.ZodEnum<["format", "lint", "import-fix", "type-narrow", "test-scaffold", "doc-update", "dependency-bump"]>;
export type RemediationAutofixClass = z.infer<typeof RemediationAutofixClass>;
export declare const RemediationFix: z.ZodObject<{
    code: z.ZodString;
    severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
    title: z.ZodString;
    detail: z.ZodString;
    files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    suggested_action: z.ZodOptional<z.ZodString>;
    suggested_command: z.ZodOptional<z.ZodString>;
    autofix_eligible: z.ZodDefault<z.ZodBoolean>;
    autofix_class: z.ZodOptional<z.ZodEnum<["format", "lint", "import-fix", "type-narrow", "test-scaffold", "doc-update", "dependency-bump"]>>;
    policy_link: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    detail: string;
    severity: "warn" | "advisory" | "blocking";
    title: string;
    files: string[];
    autofix_eligible: boolean;
    suggested_action?: string | undefined;
    suggested_command?: string | undefined;
    autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
    policy_link?: string | undefined;
}, {
    code: string;
    detail: string;
    severity: "warn" | "advisory" | "blocking";
    title: string;
    files?: string[] | undefined;
    suggested_action?: string | undefined;
    autofix_eligible?: boolean | undefined;
    suggested_command?: string | undefined;
    autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
    policy_link?: string | undefined;
}>;
export type RemediationFix = z.infer<typeof RemediationFix>;
export declare const RemediationNextAction: z.ZodEnum<["ready_to_merge", "fix_and_retry", "human_review_required", "max_rounds_exceeded"]>;
export type RemediationNextAction = z.infer<typeof RemediationNextAction>;
export declare const Remediation: z.ZodObject<{
    schema: z.ZodDefault<z.ZodLiteral<"trailhead.remediation.v1">>;
    release_ready: z.ZodBoolean;
    fixes: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
        title: z.ZodString;
        detail: z.ZodString;
        files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        suggested_action: z.ZodOptional<z.ZodString>;
        suggested_command: z.ZodOptional<z.ZodString>;
        autofix_eligible: z.ZodDefault<z.ZodBoolean>;
        autofix_class: z.ZodOptional<z.ZodEnum<["format", "lint", "import-fix", "type-narrow", "test-scaffold", "doc-update", "dependency-bump"]>>;
        policy_link: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files: string[];
        autofix_eligible: boolean;
        suggested_action?: string | undefined;
        suggested_command?: string | undefined;
        autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
        policy_link?: string | undefined;
    }, {
        code: string;
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files?: string[] | undefined;
        suggested_action?: string | undefined;
        autofix_eligible?: boolean | undefined;
        suggested_command?: string | undefined;
        autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
        policy_link?: string | undefined;
    }>, "many">;
    blocking_count: z.ZodNumber;
    warn_count: z.ZodNumber;
    advisory_count: z.ZodNumber;
    autofix_eligible_count: z.ZodNumber;
    loop_round: z.ZodDefault<z.ZodNumber>;
    max_loop_rounds: z.ZodDefault<z.ZodNumber>;
    previous_evaluation_id: z.ZodOptional<z.ZodString>;
    fixes_resolved: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    fixes_introduced: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    next_action: z.ZodEnum<["ready_to_merge", "fix_and_retry", "human_review_required", "max_rounds_exceeded"]>;
}, "strip", z.ZodTypeAny, {
    schema: "trailhead.remediation.v1";
    release_ready: boolean;
    fixes: {
        code: string;
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files: string[];
        autofix_eligible: boolean;
        suggested_action?: string | undefined;
        suggested_command?: string | undefined;
        autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
        policy_link?: string | undefined;
    }[];
    blocking_count: number;
    warn_count: number;
    advisory_count: number;
    autofix_eligible_count: number;
    loop_round: number;
    max_loop_rounds: number;
    fixes_resolved: string[];
    fixes_introduced: string[];
    next_action: "ready_to_merge" | "fix_and_retry" | "human_review_required" | "max_rounds_exceeded";
    previous_evaluation_id?: string | undefined;
}, {
    release_ready: boolean;
    fixes: {
        code: string;
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files?: string[] | undefined;
        suggested_action?: string | undefined;
        autofix_eligible?: boolean | undefined;
        suggested_command?: string | undefined;
        autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
        policy_link?: string | undefined;
    }[];
    blocking_count: number;
    warn_count: number;
    advisory_count: number;
    autofix_eligible_count: number;
    next_action: "ready_to_merge" | "fix_and_retry" | "human_review_required" | "max_rounds_exceeded";
    schema?: "trailhead.remediation.v1" | undefined;
    loop_round?: number | undefined;
    max_loop_rounds?: number | undefined;
    previous_evaluation_id?: string | undefined;
    fixes_resolved?: string[] | undefined;
    fixes_introduced?: string[] | undefined;
}>;
export type Remediation = z.infer<typeof Remediation>;
export declare const PolicyOverrideChanges: z.ZodObject<{
    failMode: z.ZodOptional<z.ZodEnum<["open", "closed"]>>;
    riskThreshold: z.ZodOptional<z.ZodNumber>;
    warnThreshold: z.ZodOptional<z.ZodNumber>;
    releaseReady: z.ZodOptional<z.ZodLiteral<true>>;
}, "strip", z.ZodTypeAny, {
    failMode?: "open" | "closed" | undefined;
    riskThreshold?: number | undefined;
    warnThreshold?: number | undefined;
    releaseReady?: true | undefined;
}, {
    failMode?: "open" | "closed" | undefined;
    riskThreshold?: number | undefined;
    warnThreshold?: number | undefined;
    releaseReady?: true | undefined;
}>;
export type PolicyOverrideChanges = z.infer<typeof PolicyOverrideChanges>;
export declare const OverrideScope: z.ZodEnum<["full", "risk_only"]>;
export type OverrideScope = z.infer<typeof OverrideScope>;
export declare const PolicyOverrideAudit: z.ZodObject<{
    source: z.ZodDefault<z.ZodEnum<["workflow", "label"]>>;
    owner: z.ZodString;
    reason: z.ZodString;
    linkedTicket: z.ZodString;
    expiresAt: z.ZodString;
    appliedAt: z.ZodString;
    scope: z.ZodOptional<z.ZodEnum<["full", "risk_only"]>>;
    changes: z.ZodDefault<z.ZodObject<{
        failMode: z.ZodOptional<z.ZodEnum<["open", "closed"]>>;
        riskThreshold: z.ZodOptional<z.ZodNumber>;
        warnThreshold: z.ZodOptional<z.ZodNumber>;
        releaseReady: z.ZodOptional<z.ZodLiteral<true>>;
    }, "strip", z.ZodTypeAny, {
        failMode?: "open" | "closed" | undefined;
        riskThreshold?: number | undefined;
        warnThreshold?: number | undefined;
        releaseReady?: true | undefined;
    }, {
        failMode?: "open" | "closed" | undefined;
        riskThreshold?: number | undefined;
        warnThreshold?: number | undefined;
        releaseReady?: true | undefined;
    }>>;
    preOverrideDecision: z.ZodOptional<z.ZodEnum<["allow", "warn", "block"]>>;
    preOverrideReleaseReady: z.ZodOptional<z.ZodBoolean>;
    preOverrideReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Blocking reasons the override cleared (risk/policy driven). */
    overriddenReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Blocking reasons that survived the override (mechanical CI, ADR-011 §3). */
    retainedReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    source: "workflow" | "label";
    owner: string;
    linkedTicket: string;
    expiresAt: string;
    appliedAt: string;
    changes: {
        failMode?: "open" | "closed" | undefined;
        riskThreshold?: number | undefined;
        warnThreshold?: number | undefined;
        releaseReady?: true | undefined;
    };
    scope?: "full" | "risk_only" | undefined;
    preOverrideDecision?: "allow" | "warn" | "block" | undefined;
    preOverrideReleaseReady?: boolean | undefined;
    preOverrideReasons?: string[] | undefined;
    overriddenReasons?: string[] | undefined;
    retainedReasons?: string[] | undefined;
}, {
    reason: string;
    owner: string;
    linkedTicket: string;
    expiresAt: string;
    appliedAt: string;
    source?: "workflow" | "label" | undefined;
    scope?: "full" | "risk_only" | undefined;
    changes?: {
        failMode?: "open" | "closed" | undefined;
        riskThreshold?: number | undefined;
        warnThreshold?: number | undefined;
        releaseReady?: true | undefined;
    } | undefined;
    preOverrideDecision?: "allow" | "warn" | "block" | undefined;
    preOverrideReleaseReady?: boolean | undefined;
    preOverrideReasons?: string[] | undefined;
    overriddenReasons?: string[] | undefined;
    retainedReasons?: string[] | undefined;
}>;
export type PolicyOverrideAudit = z.infer<typeof PolicyOverrideAudit>;
export declare const BriefVerdict: z.ZodEnum<["allow", "warn", "block", "cannot_evaluate"]>;
export type BriefVerdict = z.infer<typeof BriefVerdict>;
export declare const BriefFinding: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    evidence: z.ZodOptional<z.ZodString>;
    severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
}, "strip", z.ZodTypeAny, {
    severity: "warn" | "advisory" | "blocking";
    title: string;
    id: string;
    evidence?: string | undefined;
}, {
    severity: "warn" | "advisory" | "blocking";
    title: string;
    id: string;
    evidence?: string | undefined;
}>;
export type BriefFinding = z.infer<typeof BriefFinding>;
export declare const BriefInput: z.ZodObject<{
    checkName: z.ZodString;
    /** ADR-009 status, carried as a string so the renderer stays policy-agnostic. */
    status: z.ZodString;
    /** ADR-011 §2 disposition kind. */
    disposition: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: string;
    disposition: string;
    checkName: string;
    reason?: string | undefined;
}, {
    status: string;
    disposition: string;
    checkName: string;
    reason?: string | undefined;
}>;
export type BriefInput = z.infer<typeof BriefInput>;
export declare const BriefAction: z.ZodObject<{
    kind: z.ZodEnum<["fix", "override", "wait"]>;
    detail: z.ZodString;
    link: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    detail: string;
    kind: "fix" | "override" | "wait";
    link?: string | undefined;
}, {
    detail: string;
    kind: "fix" | "override" | "wait";
    link?: string | undefined;
}>;
export type BriefAction = z.infer<typeof BriefAction>;
export declare const BriefOverride: z.ZodObject<{
    by: z.ZodString;
    at: z.ZodString;
    scope: z.ZodString;
    rationale: z.ZodString;
}, "strip", z.ZodTypeAny, {
    at: string;
    scope: string;
    by: string;
    rationale: string;
}, {
    at: string;
    scope: string;
    by: string;
    rationale: string;
}>;
export type BriefOverride = z.infer<typeof BriefOverride>;
export declare const BriefOverrideStatus: z.ZodObject<{
    status: z.ZodEnum<["applied", "partial", "rejected", "revoked", "unavailable"]>;
    message: z.ZodString;
    source: z.ZodOptional<z.ZodEnum<["live", "payload_fallback"]>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
    source?: "live" | "payload_fallback" | undefined;
}, {
    message: string;
    status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
    source?: "live" | "payload_fallback" | undefined;
}>;
export type BriefOverrideStatus = z.infer<typeof BriefOverrideStatus>;
export declare const BriefRequiredCheck: z.ZodObject<{
    published: z.ZodBoolean;
    /** Whether the published check body contains this D3 publication record. */
    reportRefreshed: z.ZodBoolean;
    name: z.ZodString;
    headSha: z.ZodString;
    eventName: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    name: string;
    published: boolean;
    reportRefreshed: boolean;
    headSha: string;
    eventName: string;
}, {
    message: string;
    name: string;
    published: boolean;
    reportRefreshed: boolean;
    headSha: string;
    eventName: string;
}>;
export type BriefRequiredCheck = z.infer<typeof BriefRequiredCheck>;
export declare const ReleaseBrief: z.ZodObject<{
    verdict: z.ZodEnum<["allow", "warn", "block", "cannot_evaluate"]>;
    riskScore: z.ZodOptional<z.ZodNumber>;
    riskThreshold: z.ZodOptional<z.ZodNumber>;
    topMovers: z.ZodOptional<z.ZodArray<z.ZodObject<{
        factor: z.ZodString;
        score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        score: number;
        factor: string;
    }, {
        score: number;
        factor: string;
    }>, "many">>;
    findings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        evidence: z.ZodOptional<z.ZodString>;
        severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
    }, "strip", z.ZodTypeAny, {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }, {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }>, "many">;
    inputs: z.ZodArray<z.ZodObject<{
        checkName: z.ZodString;
        /** ADR-009 status, carried as a string so the renderer stays policy-agnostic. */
        status: z.ZodString;
        /** ADR-011 §2 disposition kind. */
        disposition: z.ZodString;
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: string;
        disposition: string;
        checkName: string;
        reason?: string | undefined;
    }, {
        status: string;
        disposition: string;
        checkName: string;
        reason?: string | undefined;
    }>, "many">;
    delta: z.ZodOptional<z.ZodString>;
    actions: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["fix", "override", "wait"]>;
        detail: z.ZodString;
        link: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        detail: string;
        kind: "fix" | "override" | "wait";
        link?: string | undefined;
    }, {
        detail: string;
        kind: "fix" | "override" | "wait";
        link?: string | undefined;
    }>, "many">;
    override: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        by: z.ZodString;
        at: z.ZodString;
        scope: z.ZodString;
        rationale: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        at: string;
        scope: string;
        by: string;
        rationale: string;
    }, {
        at: string;
        scope: string;
        by: string;
        rationale: string;
    }>>>;
    overrideStatus: z.ZodOptional<z.ZodObject<{
        status: z.ZodEnum<["applied", "partial", "rejected", "revoked", "unavailable"]>;
        message: z.ZodString;
        source: z.ZodOptional<z.ZodEnum<["live", "payload_fallback"]>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    }, {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    }>>;
    requiredCheck: z.ZodOptional<z.ZodObject<{
        published: z.ZodBoolean;
        /** Whether the published check body contains this D3 publication record. */
        reportRefreshed: z.ZodBoolean;
        name: z.ZodString;
        headSha: z.ZodString;
        eventName: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        message: string;
        name: string;
        published: boolean;
        reportRefreshed: boolean;
        headSha: string;
        eventName: string;
    }, {
        message: string;
        name: string;
        published: boolean;
        reportRefreshed: boolean;
        headSha: string;
        eventName: string;
    }>>;
    cannotEvaluateReason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    verdict: "allow" | "warn" | "block" | "cannot_evaluate";
    findings: {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }[];
    inputs: {
        status: string;
        disposition: string;
        checkName: string;
        reason?: string | undefined;
    }[];
    actions: {
        detail: string;
        kind: "fix" | "override" | "wait";
        link?: string | undefined;
    }[];
    riskThreshold?: number | undefined;
    override?: {
        at: string;
        scope: string;
        by: string;
        rationale: string;
    } | null | undefined;
    riskScore?: number | undefined;
    topMovers?: {
        score: number;
        factor: string;
    }[] | undefined;
    delta?: string | undefined;
    overrideStatus?: {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    } | undefined;
    requiredCheck?: {
        message: string;
        name: string;
        published: boolean;
        reportRefreshed: boolean;
        headSha: string;
        eventName: string;
    } | undefined;
    cannotEvaluateReason?: string | undefined;
}, {
    verdict: "allow" | "warn" | "block" | "cannot_evaluate";
    findings: {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }[];
    inputs: {
        status: string;
        disposition: string;
        checkName: string;
        reason?: string | undefined;
    }[];
    actions: {
        detail: string;
        kind: "fix" | "override" | "wait";
        link?: string | undefined;
    }[];
    riskThreshold?: number | undefined;
    override?: {
        at: string;
        scope: string;
        by: string;
        rationale: string;
    } | null | undefined;
    riskScore?: number | undefined;
    topMovers?: {
        score: number;
        factor: string;
    }[] | undefined;
    delta?: string | undefined;
    overrideStatus?: {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    } | undefined;
    requiredCheck?: {
        message: string;
        name: string;
        published: boolean;
        reportRefreshed: boolean;
        headSha: string;
        eventName: string;
    } | undefined;
    cannotEvaluateReason?: string | undefined;
}>;
export type ReleaseBrief = z.infer<typeof ReleaseBrief>;
export declare const CreditMeterResult: z.ZodObject<{
    metered: z.ZodBoolean;
    skipped: z.ZodOptional<z.ZodBoolean>;
    reason: z.ZodOptional<z.ZodString>;
    shadow: z.ZodOptional<z.ZodBoolean>;
    would_charge: z.ZodOptional<z.ZodNumber>;
    charged: z.ZodOptional<z.ZodNumber>;
    balance: z.ZodOptional<z.ZodNumber>;
    allowed: z.ZodOptional<z.ZodBoolean>;
    ok: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    metered: boolean;
    reason?: string | undefined;
    skipped?: boolean | undefined;
    shadow?: boolean | undefined;
    would_charge?: number | undefined;
    charged?: number | undefined;
    balance?: number | undefined;
    allowed?: boolean | undefined;
    ok?: boolean | undefined;
}, {
    metered: boolean;
    reason?: string | undefined;
    skipped?: boolean | undefined;
    shadow?: boolean | undefined;
    would_charge?: number | undefined;
    charged?: number | undefined;
    balance?: number | undefined;
    allowed?: boolean | undefined;
    ok?: boolean | undefined;
}>;
export type CreditMeterResult = z.infer<typeof CreditMeterResult>;
export declare const GateEvaluation: z.ZodObject<{
    id: z.ZodString;
    repoId: z.ZodString;
    commitSha: z.ZodString;
    prNumber: z.ZodOptional<z.ZodNumber>;
    healthScore: z.ZodNumber;
    riskScore: z.ZodNumber;
    sizeScore: z.ZodOptional<z.ZodNumber>;
    gateDecision: z.ZodEnum<["allow", "warn", "block"]>;
    healthChecks: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        status: z.ZodEnum<["allow", "warn", "block"]>;
        latencyMs: z.ZodNumber;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }, {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }>, "many">;
    riskFactors: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["code_churn", "test_coverage", "file_count", "sensitive_files", "author_history", "dependency_changes", "pr_age", "security_alerts", "deployment_history", "canary_status", "ci_integrity", "workflow_security", "prompt_injection_risk", "supply_chain", "pr_scope", "duplicate_logic", "cross_repo_impact"]>;
        score: z.ZodNumber;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }>, "many">;
    sizeFactors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["code_churn", "test_coverage", "file_count", "sensitive_files", "author_history", "dependency_changes", "pr_age", "security_alerts", "deployment_history", "canary_status", "ci_integrity", "workflow_security", "prompt_injection_risk", "supply_chain", "pr_scope", "duplicate_logic", "cross_repo_impact"]>;
        score: z.ZodNumber;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }>, "many">>;
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    evaluationMs: z.ZodNumber;
    reportUrl: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodString>;
    service: z.ZodOptional<z.ZodString>;
    policyFindings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enumeratedFindings: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        evidence: z.ZodOptional<z.ZodString>;
        severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
    }, "strip", z.ZodTypeAny, {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }, {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }>, "many">>;
    releaseBrief: z.ZodOptional<z.ZodObject<{
        verdict: z.ZodEnum<["allow", "warn", "block", "cannot_evaluate"]>;
        riskScore: z.ZodOptional<z.ZodNumber>;
        riskThreshold: z.ZodOptional<z.ZodNumber>;
        topMovers: z.ZodOptional<z.ZodArray<z.ZodObject<{
            factor: z.ZodString;
            score: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            score: number;
            factor: string;
        }, {
            score: number;
            factor: string;
        }>, "many">>;
        findings: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            evidence: z.ZodOptional<z.ZodString>;
            severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
        }, "strip", z.ZodTypeAny, {
            severity: "warn" | "advisory" | "blocking";
            title: string;
            id: string;
            evidence?: string | undefined;
        }, {
            severity: "warn" | "advisory" | "blocking";
            title: string;
            id: string;
            evidence?: string | undefined;
        }>, "many">;
        inputs: z.ZodArray<z.ZodObject<{
            checkName: z.ZodString;
            /** ADR-009 status, carried as a string so the renderer stays policy-agnostic. */
            status: z.ZodString;
            /** ADR-011 §2 disposition kind. */
            disposition: z.ZodString;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            status: string;
            disposition: string;
            checkName: string;
            reason?: string | undefined;
        }, {
            status: string;
            disposition: string;
            checkName: string;
            reason?: string | undefined;
        }>, "many">;
        delta: z.ZodOptional<z.ZodString>;
        actions: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<["fix", "override", "wait"]>;
            detail: z.ZodString;
            link: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            detail: string;
            kind: "fix" | "override" | "wait";
            link?: string | undefined;
        }, {
            detail: string;
            kind: "fix" | "override" | "wait";
            link?: string | undefined;
        }>, "many">;
        override: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            by: z.ZodString;
            at: z.ZodString;
            scope: z.ZodString;
            rationale: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            at: string;
            scope: string;
            by: string;
            rationale: string;
        }, {
            at: string;
            scope: string;
            by: string;
            rationale: string;
        }>>>;
        overrideStatus: z.ZodOptional<z.ZodObject<{
            status: z.ZodEnum<["applied", "partial", "rejected", "revoked", "unavailable"]>;
            message: z.ZodString;
            source: z.ZodOptional<z.ZodEnum<["live", "payload_fallback"]>>;
        }, "strip", z.ZodTypeAny, {
            message: string;
            status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
            source?: "live" | "payload_fallback" | undefined;
        }, {
            message: string;
            status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
            source?: "live" | "payload_fallback" | undefined;
        }>>;
        requiredCheck: z.ZodOptional<z.ZodObject<{
            published: z.ZodBoolean;
            /** Whether the published check body contains this D3 publication record. */
            reportRefreshed: z.ZodBoolean;
            name: z.ZodString;
            headSha: z.ZodString;
            eventName: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
            name: string;
            published: boolean;
            reportRefreshed: boolean;
            headSha: string;
            eventName: string;
        }, {
            message: string;
            name: string;
            published: boolean;
            reportRefreshed: boolean;
            headSha: string;
            eventName: string;
        }>>;
        cannotEvaluateReason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        verdict: "allow" | "warn" | "block" | "cannot_evaluate";
        findings: {
            severity: "warn" | "advisory" | "blocking";
            title: string;
            id: string;
            evidence?: string | undefined;
        }[];
        inputs: {
            status: string;
            disposition: string;
            checkName: string;
            reason?: string | undefined;
        }[];
        actions: {
            detail: string;
            kind: "fix" | "override" | "wait";
            link?: string | undefined;
        }[];
        riskThreshold?: number | undefined;
        override?: {
            at: string;
            scope: string;
            by: string;
            rationale: string;
        } | null | undefined;
        riskScore?: number | undefined;
        topMovers?: {
            score: number;
            factor: string;
        }[] | undefined;
        delta?: string | undefined;
        overrideStatus?: {
            message: string;
            status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
            source?: "live" | "payload_fallback" | undefined;
        } | undefined;
        requiredCheck?: {
            message: string;
            name: string;
            published: boolean;
            reportRefreshed: boolean;
            headSha: string;
            eventName: string;
        } | undefined;
        cannotEvaluateReason?: string | undefined;
    }, {
        verdict: "allow" | "warn" | "block" | "cannot_evaluate";
        findings: {
            severity: "warn" | "advisory" | "blocking";
            title: string;
            id: string;
            evidence?: string | undefined;
        }[];
        inputs: {
            status: string;
            disposition: string;
            checkName: string;
            reason?: string | undefined;
        }[];
        actions: {
            detail: string;
            kind: "fix" | "override" | "wait";
            link?: string | undefined;
        }[];
        riskThreshold?: number | undefined;
        override?: {
            at: string;
            scope: string;
            by: string;
            rationale: string;
        } | null | undefined;
        riskScore?: number | undefined;
        topMovers?: {
            score: number;
            factor: string;
        }[] | undefined;
        delta?: string | undefined;
        overrideStatus?: {
            message: string;
            status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
            source?: "live" | "payload_fallback" | undefined;
        } | undefined;
        requiredCheck?: {
            message: string;
            name: string;
            published: boolean;
            reportRefreshed: boolean;
            headSha: string;
            eventName: string;
        } | undefined;
        cannotEvaluateReason?: string | undefined;
    }>>;
    pr: z.ZodOptional<z.ZodObject<{
        provenance: z.ZodOptional<z.ZodObject<{
            type: z.ZodEnum<["human", "dependabot", "copilot", "codex", "claude", "custom-bot", "unknown"]>;
            confidence: z.ZodNumber;
            source: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        }, {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        }>>;
        headRef: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
        headRef?: string | undefined;
    }, {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
        headRef?: string | undefined;
    }>>;
    session_correlation: z.ZodOptional<z.ZodObject<{
        burst_count: z.ZodNumber;
        window: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        burst_count: number;
        window: string;
    }, {
        burst_count: number;
        window: string;
    }>>;
    escalation_status: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodBoolean;
        target_count: z.ZodNumber;
        acknowledge_sla_minutes: z.ZodOptional<z.ZodNumber>;
        resolve_sla_minutes: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        target_count: number;
        acknowledge_sla_minutes?: number | undefined;
        resolve_sla_minutes?: number | undefined;
    }, {
        enabled: boolean;
        target_count: number;
        acknowledge_sla_minutes?: number | undefined;
        resolve_sla_minutes?: number | undefined;
    }>>;
    trust_profile: z.ZodOptional<z.ZodObject<{
        strictness: z.ZodEnum<["baseline", "elevated", "strict"]>;
        reason: z.ZodString;
        score: z.ZodOptional<z.ZodNumber>;
        profile: z.ZodOptional<z.ZodEnum<["fast-track", "standard", "probation"]>>;
        factors: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
    }, {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
    }>>;
    policyOverride: z.ZodOptional<z.ZodObject<{
        source: z.ZodDefault<z.ZodEnum<["workflow", "label"]>>;
        owner: z.ZodString;
        reason: z.ZodString;
        linkedTicket: z.ZodString;
        expiresAt: z.ZodString;
        appliedAt: z.ZodString;
        scope: z.ZodOptional<z.ZodEnum<["full", "risk_only"]>>;
        changes: z.ZodDefault<z.ZodObject<{
            failMode: z.ZodOptional<z.ZodEnum<["open", "closed"]>>;
            riskThreshold: z.ZodOptional<z.ZodNumber>;
            warnThreshold: z.ZodOptional<z.ZodNumber>;
            releaseReady: z.ZodOptional<z.ZodLiteral<true>>;
        }, "strip", z.ZodTypeAny, {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
            releaseReady?: true | undefined;
        }, {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
            releaseReady?: true | undefined;
        }>>;
        preOverrideDecision: z.ZodOptional<z.ZodEnum<["allow", "warn", "block"]>>;
        preOverrideReleaseReady: z.ZodOptional<z.ZodBoolean>;
        preOverrideReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Blocking reasons the override cleared (risk/policy driven). */
        overriddenReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Blocking reasons that survived the override (mechanical CI, ADR-011 §3). */
        retainedReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        source: "workflow" | "label";
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        changes: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
            releaseReady?: true | undefined;
        };
        scope?: "full" | "risk_only" | undefined;
        preOverrideDecision?: "allow" | "warn" | "block" | undefined;
        preOverrideReleaseReady?: boolean | undefined;
        preOverrideReasons?: string[] | undefined;
        overriddenReasons?: string[] | undefined;
        retainedReasons?: string[] | undefined;
    }, {
        reason: string;
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        source?: "workflow" | "label" | undefined;
        scope?: "full" | "risk_only" | undefined;
        changes?: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
            releaseReady?: true | undefined;
        } | undefined;
        preOverrideDecision?: "allow" | "warn" | "block" | undefined;
        preOverrideReleaseReady?: boolean | undefined;
        preOverrideReasons?: string[] | undefined;
        overriddenReasons?: string[] | undefined;
        retainedReasons?: string[] | undefined;
    }>>;
    labelOverrideFeedback: z.ZodOptional<z.ZodObject<{
        status: z.ZodEnum<["applied", "partial", "rejected", "revoked", "unavailable"]>;
        message: z.ZodString;
        source: z.ZodOptional<z.ZodEnum<["live", "payload_fallback"]>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    }, {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    }>>;
    releaseReady: z.ZodOptional<z.ZodBoolean>;
    releaseReadyReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    ci: z.ZodOptional<z.ZodObject<{
        checks: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            status: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
            conclusion: z.ZodOptional<z.ZodString>;
            detailsUrl: z.ZodOptional<z.ZodString>;
            required: z.ZodBoolean;
            disposition: z.ZodOptional<z.ZodObject<{
                kind: z.ZodEnum<["blocking", "advisory", "irrelevant", "missing_blocking"]>;
                reason: z.ZodOptional<z.ZodString>;
                /** `policy` = an input_relevance entry matched; `default` = required/optional fallback. */
                source: z.ZodEnum<["policy", "default"]>;
            }, "strip", z.ZodTypeAny, {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            }, {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
            disposition?: {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            } | undefined;
        }, {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
            disposition?: {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            } | undefined;
        }>, "many">;
        allRequiredPassed: z.ZodBoolean;
        pendingCount: z.ZodNumber;
        failedCount: z.ZodNumber;
        missingCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        checks: {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
            disposition?: {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            } | undefined;
        }[];
        allRequiredPassed: boolean;
        pendingCount: number;
        failedCount: number;
        missingCount: number;
    }, {
        checks: {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
            disposition?: {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            } | undefined;
        }[];
        allRequiredPassed: boolean;
        pendingCount: number;
        failedCount: number;
        missingCount: number;
    }>>;
    context: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        environment: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        environment?: string | undefined;
    }, {
        name: string;
        environment?: string | undefined;
    }>>;
    gateMode: z.ZodOptional<z.ZodEnum<["release-ready", "advisory", "risk-only"]>>;
    /** Effective Checks API context after action-input and repo-config resolution. */
    resolvedCheckName: z.ZodOptional<z.ZodString>;
    storePersisted: z.ZodOptional<z.ZodBoolean>;
    credit_meter: z.ZodOptional<z.ZodObject<{
        metered: z.ZodBoolean;
        skipped: z.ZodOptional<z.ZodBoolean>;
        reason: z.ZodOptional<z.ZodString>;
        shadow: z.ZodOptional<z.ZodBoolean>;
        would_charge: z.ZodOptional<z.ZodNumber>;
        charged: z.ZodOptional<z.ZodNumber>;
        balance: z.ZodOptional<z.ZodNumber>;
        allowed: z.ZodOptional<z.ZodBoolean>;
        ok: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        metered: boolean;
        reason?: string | undefined;
        skipped?: boolean | undefined;
        shadow?: boolean | undefined;
        would_charge?: number | undefined;
        charged?: number | undefined;
        balance?: number | undefined;
        allowed?: boolean | undefined;
        ok?: boolean | undefined;
    }, {
        metered: boolean;
        reason?: string | undefined;
        skipped?: boolean | undefined;
        shadow?: boolean | undefined;
        would_charge?: number | undefined;
        charged?: number | undefined;
        balance?: number | undefined;
        allowed?: boolean | undefined;
        ok?: boolean | undefined;
    }>>;
    remediation: z.ZodOptional<z.ZodObject<{
        schema: z.ZodDefault<z.ZodLiteral<"trailhead.remediation.v1">>;
        release_ready: z.ZodBoolean;
        fixes: z.ZodArray<z.ZodObject<{
            code: z.ZodString;
            severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
            title: z.ZodString;
            detail: z.ZodString;
            files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            suggested_action: z.ZodOptional<z.ZodString>;
            suggested_command: z.ZodOptional<z.ZodString>;
            autofix_eligible: z.ZodDefault<z.ZodBoolean>;
            autofix_class: z.ZodOptional<z.ZodEnum<["format", "lint", "import-fix", "type-narrow", "test-scaffold", "doc-update", "dependency-bump"]>>;
            policy_link: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            code: string;
            detail: string;
            severity: "warn" | "advisory" | "blocking";
            title: string;
            files: string[];
            autofix_eligible: boolean;
            suggested_action?: string | undefined;
            suggested_command?: string | undefined;
            autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
            policy_link?: string | undefined;
        }, {
            code: string;
            detail: string;
            severity: "warn" | "advisory" | "blocking";
            title: string;
            files?: string[] | undefined;
            suggested_action?: string | undefined;
            autofix_eligible?: boolean | undefined;
            suggested_command?: string | undefined;
            autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
            policy_link?: string | undefined;
        }>, "many">;
        blocking_count: z.ZodNumber;
        warn_count: z.ZodNumber;
        advisory_count: z.ZodNumber;
        autofix_eligible_count: z.ZodNumber;
        loop_round: z.ZodDefault<z.ZodNumber>;
        max_loop_rounds: z.ZodDefault<z.ZodNumber>;
        previous_evaluation_id: z.ZodOptional<z.ZodString>;
        fixes_resolved: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        fixes_introduced: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        next_action: z.ZodEnum<["ready_to_merge", "fix_and_retry", "human_review_required", "max_rounds_exceeded"]>;
    }, "strip", z.ZodTypeAny, {
        schema: "trailhead.remediation.v1";
        release_ready: boolean;
        fixes: {
            code: string;
            detail: string;
            severity: "warn" | "advisory" | "blocking";
            title: string;
            files: string[];
            autofix_eligible: boolean;
            suggested_action?: string | undefined;
            suggested_command?: string | undefined;
            autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
            policy_link?: string | undefined;
        }[];
        blocking_count: number;
        warn_count: number;
        advisory_count: number;
        autofix_eligible_count: number;
        loop_round: number;
        max_loop_rounds: number;
        fixes_resolved: string[];
        fixes_introduced: string[];
        next_action: "ready_to_merge" | "fix_and_retry" | "human_review_required" | "max_rounds_exceeded";
        previous_evaluation_id?: string | undefined;
    }, {
        release_ready: boolean;
        fixes: {
            code: string;
            detail: string;
            severity: "warn" | "advisory" | "blocking";
            title: string;
            files?: string[] | undefined;
            suggested_action?: string | undefined;
            autofix_eligible?: boolean | undefined;
            suggested_command?: string | undefined;
            autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
            policy_link?: string | undefined;
        }[];
        blocking_count: number;
        warn_count: number;
        advisory_count: number;
        autofix_eligible_count: number;
        next_action: "ready_to_merge" | "fix_and_retry" | "human_review_required" | "max_rounds_exceeded";
        schema?: "trailhead.remediation.v1" | undefined;
        loop_round?: number | undefined;
        max_loop_rounds?: number | undefined;
        previous_evaluation_id?: string | undefined;
        fixes_resolved?: string[] | undefined;
        fixes_introduced?: string[] | undefined;
    }>>;
    agentBriefMode: z.ZodOptional<z.ZodEnum<["off", "collapsed", "expanded"]>>;
    submissionChecks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        code: z.ZodEnum<["artifact_integrity", "mock_placeholder", "context_freshness", "destructive_sql", "secrets", "path_format", "syntax_validity", "import_resolution", "rls_new_tables", "auth_route_auth", "hardcoded_env", "external_package_deps", "sql_syntax_basic", "large_file", "soul_integrity", "contract_integrity", "safe_deprecation", "destructive_change", "claim_anchoring", "promotion_coherence", "output_size_min", "action_extraction_present", "delta_section_present", "preamble_absent", "graduation_signals_section_present", "fabricated_id_check", "session_narrative_detection", "incompleteness_self_flag", "referenced_files_exist", "prerequisite_secrets_check", "dependency_dag_validation", "uncommitted_fix_check", "verification_owner_assigned", "external_interface_validation", "close_on_ship_link"]>;
        severity: z.ZodEnum<["blocking", "warn", "advisory"]>;
        title: z.ZodString;
        detail: z.ZodString;
        files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        suggested_action: z.ZodOptional<z.ZodString>;
        autofix_eligible: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation" | "close_on_ship_link";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files: string[];
        autofix_eligible: boolean;
        suggested_action?: string | undefined;
    }, {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation" | "close_on_ship_link";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files?: string[] | undefined;
        suggested_action?: string | undefined;
        autofix_eligible?: boolean | undefined;
    }>, "many">>;
    cross_repo_impact: z.ZodOptional<z.ZodObject<{
        services: z.ZodArray<z.ZodObject<{
            serviceName: z.ZodString;
            touchedFiles: z.ZodArray<z.ZodString, "many">;
            consumers: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                repo: z.ZodOptional<z.ZodString>;
                branch: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }, {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }>, "many">;
            notify_webhook: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            serviceName: string;
            touchedFiles: string[];
            consumers: {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }[];
            notify_webhook?: string | undefined;
        }, {
            serviceName: string;
            touchedFiles: string[];
            consumers: {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }[];
            notify_webhook?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        services: {
            serviceName: string;
            touchedFiles: string[];
            consumers: {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }[];
            notify_webhook?: string | undefined;
        }[];
    }, {
        services: {
            serviceName: string;
            touchedFiles: string[];
            consumers: {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }[];
            notify_webhook?: string | undefined;
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    riskScore: number;
    repoId: string;
    commitSha: string;
    healthScore: number;
    gateDecision: "allow" | "warn" | "block";
    healthChecks: {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }[];
    riskFactors: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[];
    evaluationMs: number;
    cross_repo_impact?: {
        services: {
            serviceName: string;
            touchedFiles: string[];
            consumers: {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }[];
            notify_webhook?: string | undefined;
        }[];
    } | undefined;
    environment?: string | undefined;
    files?: string[] | undefined;
    releaseReady?: boolean | undefined;
    prNumber?: number | undefined;
    sizeScore?: number | undefined;
    sizeFactors?: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    reportUrl?: string | undefined;
    service?: string | undefined;
    policyFindings?: string[] | undefined;
    enumeratedFindings?: {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }[] | undefined;
    releaseBrief?: {
        verdict: "allow" | "warn" | "block" | "cannot_evaluate";
        findings: {
            severity: "warn" | "advisory" | "blocking";
            title: string;
            id: string;
            evidence?: string | undefined;
        }[];
        inputs: {
            status: string;
            disposition: string;
            checkName: string;
            reason?: string | undefined;
        }[];
        actions: {
            detail: string;
            kind: "fix" | "override" | "wait";
            link?: string | undefined;
        }[];
        riskThreshold?: number | undefined;
        override?: {
            at: string;
            scope: string;
            by: string;
            rationale: string;
        } | null | undefined;
        riskScore?: number | undefined;
        topMovers?: {
            score: number;
            factor: string;
        }[] | undefined;
        delta?: string | undefined;
        overrideStatus?: {
            message: string;
            status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
            source?: "live" | "payload_fallback" | undefined;
        } | undefined;
        requiredCheck?: {
            message: string;
            name: string;
            published: boolean;
            reportRefreshed: boolean;
            headSha: string;
            eventName: string;
        } | undefined;
        cannotEvaluateReason?: string | undefined;
    } | undefined;
    pr?: {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
        headRef?: string | undefined;
    } | undefined;
    session_correlation?: {
        burst_count: number;
        window: string;
    } | undefined;
    escalation_status?: {
        enabled: boolean;
        target_count: number;
        acknowledge_sla_minutes?: number | undefined;
        resolve_sla_minutes?: number | undefined;
    } | undefined;
    trust_profile?: {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
    } | undefined;
    policyOverride?: {
        reason: string;
        source: "workflow" | "label";
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        changes: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
            releaseReady?: true | undefined;
        };
        scope?: "full" | "risk_only" | undefined;
        preOverrideDecision?: "allow" | "warn" | "block" | undefined;
        preOverrideReleaseReady?: boolean | undefined;
        preOverrideReasons?: string[] | undefined;
        overriddenReasons?: string[] | undefined;
        retainedReasons?: string[] | undefined;
    } | undefined;
    labelOverrideFeedback?: {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    } | undefined;
    releaseReadyReasons?: string[] | undefined;
    ci?: {
        checks: {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
            disposition?: {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            } | undefined;
        }[];
        allRequiredPassed: boolean;
        pendingCount: number;
        failedCount: number;
        missingCount: number;
    } | undefined;
    context?: {
        name: string;
        environment?: string | undefined;
    } | undefined;
    gateMode?: "release-ready" | "advisory" | "risk-only" | undefined;
    resolvedCheckName?: string | undefined;
    storePersisted?: boolean | undefined;
    credit_meter?: {
        metered: boolean;
        reason?: string | undefined;
        skipped?: boolean | undefined;
        shadow?: boolean | undefined;
        would_charge?: number | undefined;
        charged?: number | undefined;
        balance?: number | undefined;
        allowed?: boolean | undefined;
        ok?: boolean | undefined;
    } | undefined;
    remediation?: {
        schema: "trailhead.remediation.v1";
        release_ready: boolean;
        fixes: {
            code: string;
            detail: string;
            severity: "warn" | "advisory" | "blocking";
            title: string;
            files: string[];
            autofix_eligible: boolean;
            suggested_action?: string | undefined;
            suggested_command?: string | undefined;
            autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
            policy_link?: string | undefined;
        }[];
        blocking_count: number;
        warn_count: number;
        advisory_count: number;
        autofix_eligible_count: number;
        loop_round: number;
        max_loop_rounds: number;
        fixes_resolved: string[];
        fixes_introduced: string[];
        next_action: "ready_to_merge" | "fix_and_retry" | "human_review_required" | "max_rounds_exceeded";
        previous_evaluation_id?: string | undefined;
    } | undefined;
    agentBriefMode?: "off" | "collapsed" | "expanded" | undefined;
    submissionChecks?: {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation" | "close_on_ship_link";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files: string[];
        autofix_eligible: boolean;
        suggested_action?: string | undefined;
    }[] | undefined;
}, {
    id: string;
    riskScore: number;
    repoId: string;
    commitSha: string;
    healthScore: number;
    gateDecision: "allow" | "warn" | "block";
    healthChecks: {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }[];
    riskFactors: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[];
    evaluationMs: number;
    cross_repo_impact?: {
        services: {
            serviceName: string;
            touchedFiles: string[];
            consumers: {
                id: string;
                repo?: string | undefined;
                branch?: string | undefined;
            }[];
            notify_webhook?: string | undefined;
        }[];
    } | undefined;
    environment?: string | undefined;
    files?: string[] | undefined;
    releaseReady?: boolean | undefined;
    prNumber?: number | undefined;
    sizeScore?: number | undefined;
    sizeFactors?: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    reportUrl?: string | undefined;
    service?: string | undefined;
    policyFindings?: string[] | undefined;
    enumeratedFindings?: {
        severity: "warn" | "advisory" | "blocking";
        title: string;
        id: string;
        evidence?: string | undefined;
    }[] | undefined;
    releaseBrief?: {
        verdict: "allow" | "warn" | "block" | "cannot_evaluate";
        findings: {
            severity: "warn" | "advisory" | "blocking";
            title: string;
            id: string;
            evidence?: string | undefined;
        }[];
        inputs: {
            status: string;
            disposition: string;
            checkName: string;
            reason?: string | undefined;
        }[];
        actions: {
            detail: string;
            kind: "fix" | "override" | "wait";
            link?: string | undefined;
        }[];
        riskThreshold?: number | undefined;
        override?: {
            at: string;
            scope: string;
            by: string;
            rationale: string;
        } | null | undefined;
        riskScore?: number | undefined;
        topMovers?: {
            score: number;
            factor: string;
        }[] | undefined;
        delta?: string | undefined;
        overrideStatus?: {
            message: string;
            status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
            source?: "live" | "payload_fallback" | undefined;
        } | undefined;
        requiredCheck?: {
            message: string;
            name: string;
            published: boolean;
            reportRefreshed: boolean;
            headSha: string;
            eventName: string;
        } | undefined;
        cannotEvaluateReason?: string | undefined;
    } | undefined;
    pr?: {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
        headRef?: string | undefined;
    } | undefined;
    session_correlation?: {
        burst_count: number;
        window: string;
    } | undefined;
    escalation_status?: {
        enabled: boolean;
        target_count: number;
        acknowledge_sla_minutes?: number | undefined;
        resolve_sla_minutes?: number | undefined;
    } | undefined;
    trust_profile?: {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
        score?: number | undefined;
        profile?: "fast-track" | "standard" | "probation" | undefined;
        factors?: Record<string, number> | undefined;
    } | undefined;
    policyOverride?: {
        reason: string;
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        source?: "workflow" | "label" | undefined;
        scope?: "full" | "risk_only" | undefined;
        changes?: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
            releaseReady?: true | undefined;
        } | undefined;
        preOverrideDecision?: "allow" | "warn" | "block" | undefined;
        preOverrideReleaseReady?: boolean | undefined;
        preOverrideReasons?: string[] | undefined;
        overriddenReasons?: string[] | undefined;
        retainedReasons?: string[] | undefined;
    } | undefined;
    labelOverrideFeedback?: {
        message: string;
        status: "applied" | "partial" | "rejected" | "revoked" | "unavailable";
        source?: "live" | "payload_fallback" | undefined;
    } | undefined;
    releaseReadyReasons?: string[] | undefined;
    ci?: {
        checks: {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
            disposition?: {
                source: "policy" | "default";
                kind: "advisory" | "blocking" | "irrelevant" | "missing_blocking";
                reason?: string | undefined;
            } | undefined;
        }[];
        allRequiredPassed: boolean;
        pendingCount: number;
        failedCount: number;
        missingCount: number;
    } | undefined;
    context?: {
        name: string;
        environment?: string | undefined;
    } | undefined;
    gateMode?: "release-ready" | "advisory" | "risk-only" | undefined;
    resolvedCheckName?: string | undefined;
    storePersisted?: boolean | undefined;
    credit_meter?: {
        metered: boolean;
        reason?: string | undefined;
        skipped?: boolean | undefined;
        shadow?: boolean | undefined;
        would_charge?: number | undefined;
        charged?: number | undefined;
        balance?: number | undefined;
        allowed?: boolean | undefined;
        ok?: boolean | undefined;
    } | undefined;
    remediation?: {
        release_ready: boolean;
        fixes: {
            code: string;
            detail: string;
            severity: "warn" | "advisory" | "blocking";
            title: string;
            files?: string[] | undefined;
            suggested_action?: string | undefined;
            autofix_eligible?: boolean | undefined;
            suggested_command?: string | undefined;
            autofix_class?: "format" | "lint" | "import-fix" | "type-narrow" | "test-scaffold" | "doc-update" | "dependency-bump" | undefined;
            policy_link?: string | undefined;
        }[];
        blocking_count: number;
        warn_count: number;
        advisory_count: number;
        autofix_eligible_count: number;
        next_action: "ready_to_merge" | "fix_and_retry" | "human_review_required" | "max_rounds_exceeded";
        schema?: "trailhead.remediation.v1" | undefined;
        loop_round?: number | undefined;
        max_loop_rounds?: number | undefined;
        previous_evaluation_id?: string | undefined;
        fixes_resolved?: string[] | undefined;
        fixes_introduced?: string[] | undefined;
    } | undefined;
    agentBriefMode?: "off" | "collapsed" | "expanded" | undefined;
    submissionChecks?: {
        code: "artifact_integrity" | "mock_placeholder" | "context_freshness" | "destructive_sql" | "secrets" | "path_format" | "syntax_validity" | "import_resolution" | "rls_new_tables" | "auth_route_auth" | "hardcoded_env" | "external_package_deps" | "sql_syntax_basic" | "large_file" | "soul_integrity" | "contract_integrity" | "safe_deprecation" | "destructive_change" | "claim_anchoring" | "promotion_coherence" | "output_size_min" | "action_extraction_present" | "delta_section_present" | "preamble_absent" | "graduation_signals_section_present" | "fabricated_id_check" | "session_narrative_detection" | "incompleteness_self_flag" | "referenced_files_exist" | "prerequisite_secrets_check" | "dependency_dag_validation" | "uncommitted_fix_check" | "verification_owner_assigned" | "external_interface_validation" | "close_on_ship_link";
        detail: string;
        severity: "warn" | "advisory" | "blocking";
        title: string;
        files?: string[] | undefined;
        suggested_action?: string | undefined;
        autofix_eligible?: boolean | undefined;
    }[] | undefined;
}>;
export type GateEvaluation = z.infer<typeof GateEvaluation>;
export declare const GateApiResponse: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    reportUrl: z.ZodOptional<z.ZodString>;
    healthScore: z.ZodOptional<z.ZodNumber>;
    riskScore: z.ZodOptional<z.ZodNumber>;
    sizeScore: z.ZodOptional<z.ZodNumber>;
    gateDecision: z.ZodOptional<z.ZodEnum<["allow", "warn", "block"]>>;
    healthChecks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        status: z.ZodEnum<["allow", "warn", "block"]>;
        latencyMs: z.ZodNumber;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }, {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }>, "many">>;
    riskFactors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["code_churn", "test_coverage", "file_count", "sensitive_files", "author_history", "dependency_changes", "pr_age", "security_alerts", "deployment_history", "canary_status", "ci_integrity", "workflow_security", "prompt_injection_risk", "supply_chain", "pr_scope", "duplicate_logic", "cross_repo_impact"]>;
        score: z.ZodNumber;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }>, "many">>;
    sizeFactors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["code_churn", "test_coverage", "file_count", "sensitive_files", "author_history", "dependency_changes", "pr_age", "security_alerts", "deployment_history", "canary_status", "ci_integrity", "workflow_security", "prompt_injection_risk", "supply_chain", "pr_scope", "duplicate_logic", "cross_repo_impact"]>;
        score: z.ZodNumber;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }, {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    riskScore?: number | undefined;
    healthScore?: number | undefined;
    sizeScore?: number | undefined;
    gateDecision?: "allow" | "warn" | "block" | undefined;
    healthChecks?: {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    riskFactors?: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    sizeFactors?: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    reportUrl?: string | undefined;
}, {
    id?: string | undefined;
    riskScore?: number | undefined;
    healthScore?: number | undefined;
    sizeScore?: number | undefined;
    gateDecision?: "allow" | "warn" | "block" | undefined;
    healthChecks?: {
        status: "allow" | "warn" | "block";
        target: string;
        latencyMs: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    riskFactors?: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    sizeFactors?: {
        type: "code_churn" | "test_coverage" | "file_count" | "sensitive_files" | "author_history" | "dependency_changes" | "pr_age" | "security_alerts" | "deployment_history" | "canary_status" | "ci_integrity" | "workflow_security" | "prompt_injection_risk" | "supply_chain" | "pr_scope" | "duplicate_logic" | "cross_repo_impact";
        score: number;
        detail?: Record<string, unknown> | undefined;
    }[] | undefined;
    reportUrl?: string | undefined;
}>;
export type GateApiResponse = z.infer<typeof GateApiResponse>;
export declare const FreezeWindow: z.ZodObject<{
    days: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    afterHour: z.ZodOptional<z.ZodNumber>;
    beforeHour: z.ZodOptional<z.ZodNumber>;
    timezone: z.ZodDefault<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    days: string[];
    timezone: string;
    message?: string | undefined;
    afterHour?: number | undefined;
    beforeHour?: number | undefined;
}, {
    message?: string | undefined;
    days?: string[] | undefined;
    afterHour?: number | undefined;
    beforeHour?: number | undefined;
    timezone?: string | undefined;
}>;
export type FreezeWindow = z.infer<typeof FreezeWindow>;
export declare const EnvironmentConfig: z.ZodObject<{
    risk: z.ZodOptional<z.ZodNumber>;
    warn: z.ZodOptional<z.ZodNumber>;
    require_security_clear: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    warn?: number | undefined;
    risk?: number | undefined;
    require_security_clear?: boolean | undefined;
}, {
    warn?: number | undefined;
    risk?: number | undefined;
    require_security_clear?: boolean | undefined;
}>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfig>;
export declare const ServiceConsumerRef: z.ZodObject<{
    repo: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    notify_webhook: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    repo: string;
    name?: string | undefined;
    branch?: string | undefined;
    notify_webhook?: string | undefined;
}, {
    repo: string;
    name?: string | undefined;
    branch?: string | undefined;
    notify_webhook?: string | undefined;
}>;
export declare const ServiceConsumer: z.ZodUnion<[z.ZodString, z.ZodObject<{
    repo: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    notify_webhook: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    repo: string;
    name?: string | undefined;
    branch?: string | undefined;
    notify_webhook?: string | undefined;
}, {
    repo: string;
    name?: string | undefined;
    branch?: string | undefined;
    notify_webhook?: string | undefined;
}>]>;
export type ServiceConsumer = z.infer<typeof ServiceConsumer>;
export declare const ConsumerRegistry: z.ZodRecord<z.ZodString, z.ZodObject<{
    repo: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    notify_webhook: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    repo: string;
    name?: string | undefined;
    branch?: string | undefined;
    notify_webhook?: string | undefined;
}, {
    repo: string;
    name?: string | undefined;
    branch?: string | undefined;
    notify_webhook?: string | undefined;
}>>;
export type ConsumerRegistry = z.infer<typeof ConsumerRegistry>;
export declare const ServiceMapping: z.ZodObject<{
    paths: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodString>;
    consumers: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
        repo: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
        notify_webhook: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    }, {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    }>]>, "many">>;
    contracts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notify_webhook: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    consumers: (string | {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    })[];
    paths: string[];
    contracts: string[];
    environment?: string | undefined;
    notify_webhook?: string | undefined;
}, {
    paths: string[];
    environment?: string | undefined;
    consumers?: (string | {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    })[] | undefined;
    notify_webhook?: string | undefined;
    contracts?: string[] | undefined;
}>;
export type ServiceMapping = z.infer<typeof ServiceMapping>;
export declare const SecurityConfig: z.ZodObject<{
    severity_threshold: z.ZodDefault<z.ZodEnum<["error", "warning", "note", "none"]>>;
    block_on_critical: z.ZodDefault<z.ZodBoolean>;
    ignore_rules: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    severity_threshold: "error" | "warning" | "note" | "none";
    block_on_critical: boolean;
    ignore_rules: string[];
}, {
    severity_threshold?: "error" | "warning" | "note" | "none" | undefined;
    block_on_critical?: boolean | undefined;
    ignore_rules?: string[] | undefined;
}>;
export type SecurityConfig = z.infer<typeof SecurityConfig>;
export declare const CanaryConfig: z.ZodObject<{
    webhook_type: z.ZodDefault<z.ZodEnum<["vercel", "generic"]>>;
    field_map: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    rollback_on_failure: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    webhook_type: "vercel" | "generic";
    rollback_on_failure: boolean;
    field_map?: Record<string, string> | undefined;
}, {
    webhook_type?: "vercel" | "generic" | undefined;
    field_map?: Record<string, string> | undefined;
    rollback_on_failure?: boolean | undefined;
}>;
export type CanaryConfig = z.infer<typeof CanaryConfig>;
export declare const RiskProfileMatch: z.ZodObject<{
    files_include: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    files_exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    min_files: z.ZodOptional<z.ZodNumber>;
    max_files: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    files_include: string[];
    files_exclude: string[];
    min_files?: number | undefined;
    max_files?: number | undefined;
}, {
    files_include?: string[] | undefined;
    files_exclude?: string[] | undefined;
    min_files?: number | undefined;
    max_files?: number | undefined;
}>;
export type RiskProfileMatch = z.infer<typeof RiskProfileMatch>;
export declare const RiskProfile: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    match: z.ZodObject<{
        files_include: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        files_exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        min_files: z.ZodOptional<z.ZodNumber>;
        max_files: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        files_include: string[];
        files_exclude: string[];
        min_files?: number | undefined;
        max_files?: number | undefined;
    }, {
        files_include?: string[] | undefined;
        files_exclude?: string[] | undefined;
        min_files?: number | undefined;
        max_files?: number | undefined;
    }>;
    weights: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    match: {
        files_include: string[];
        files_exclude: string[];
        min_files?: number | undefined;
        max_files?: number | undefined;
    };
    weights: Record<string, number>;
    name?: string | undefined;
}, {
    match: {
        files_include?: string[] | undefined;
        files_exclude?: string[] | undefined;
        min_files?: number | undefined;
        max_files?: number | undefined;
    };
    name?: string | undefined;
    weights?: Record<string, number> | undefined;
}>;
export type RiskProfile = z.infer<typeof RiskProfile>;
export declare const ContextMatch: z.ZodObject<{
    base_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    head_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    labels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    base_branch: string[];
    head_branch: string[];
    labels: string[];
}, {
    base_branch?: string[] | undefined;
    head_branch?: string[] | undefined;
    labels?: string[] | undefined;
}>;
export type ContextMatch = z.infer<typeof ContextMatch>;
export declare const ContextCiConfig: z.ZodObject<{
    required_checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    optional_checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    missing_required: z.ZodDefault<z.ZodEnum<["fail", "skip"]>>;
}, "strip", z.ZodTypeAny, {
    required_checks: string[];
    optional_checks: string[];
    missing_required: "fail" | "skip";
}, {
    required_checks?: string[] | undefined;
    optional_checks?: string[] | undefined;
    missing_required?: "fail" | "skip" | undefined;
}>;
export type ContextCiConfig = z.infer<typeof ContextCiConfig>;
export declare const InputRelevanceEntry: z.ZodObject<{
    pattern: z.ZodString;
    disposition: z.ZodEnum<["blocking", "advisory", "irrelevant"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    disposition: "advisory" | "blocking" | "irrelevant";
    pattern: string;
    reason?: string | undefined;
}, {
    disposition: "advisory" | "blocking" | "irrelevant";
    pattern: string;
    reason?: string | undefined;
}>;
export type InputRelevanceEntry = z.infer<typeof InputRelevanceEntry>;
/** ADR-011 §4 — per-branch-pair stance when the evaluation cannot run. */
export declare const AvailabilityStance: z.ZodEnum<["fail_open", "fail_closed"]>;
export type AvailabilityStance = z.infer<typeof AvailabilityStance>;
export declare const TrailheadContext: z.ZodObject<{
    name: z.ZodString;
    match: z.ZodObject<{
        base_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        head_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        labels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        base_branch: string[];
        head_branch: string[];
        labels: string[];
    }, {
        base_branch?: string[] | undefined;
        head_branch?: string[] | undefined;
        labels?: string[] | undefined;
    }>;
    environment: z.ZodOptional<z.ZodString>;
    thresholds: z.ZodDefault<z.ZodObject<{
        risk: z.ZodOptional<z.ZodNumber>;
        warn: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        warn?: number | undefined;
        risk?: number | undefined;
    }, {
        warn?: number | undefined;
        risk?: number | undefined;
    }>>;
    ci: z.ZodDefault<z.ZodObject<{
        required_checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        optional_checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        missing_required: z.ZodDefault<z.ZodEnum<["fail", "skip"]>>;
    }, "strip", z.ZodTypeAny, {
        required_checks: string[];
        optional_checks: string[];
        missing_required: "fail" | "skip";
    }, {
        required_checks?: string[] | undefined;
        optional_checks?: string[] | undefined;
        missing_required?: "fail" | "skip" | undefined;
    }>>;
    input_relevance: z.ZodDefault<z.ZodArray<z.ZodObject<{
        pattern: z.ZodString;
        disposition: z.ZodEnum<["blocking", "advisory", "irrelevant"]>;
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        disposition: "advisory" | "blocking" | "irrelevant";
        pattern: string;
        reason?: string | undefined;
    }, {
        disposition: "advisory" | "blocking" | "irrelevant";
        pattern: string;
        reason?: string | undefined;
    }>, "many">>;
    availability: z.ZodOptional<z.ZodEnum<["fail_open", "fail_closed"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    match: {
        base_branch: string[];
        head_branch: string[];
        labels: string[];
    };
    ci: {
        required_checks: string[];
        optional_checks: string[];
        missing_required: "fail" | "skip";
    };
    thresholds: {
        warn?: number | undefined;
        risk?: number | undefined;
    };
    input_relevance: {
        disposition: "advisory" | "blocking" | "irrelevant";
        pattern: string;
        reason?: string | undefined;
    }[];
    environment?: string | undefined;
    availability?: "fail_open" | "fail_closed" | undefined;
}, {
    name: string;
    match: {
        base_branch?: string[] | undefined;
        head_branch?: string[] | undefined;
        labels?: string[] | undefined;
    };
    environment?: string | undefined;
    ci?: {
        required_checks?: string[] | undefined;
        optional_checks?: string[] | undefined;
        missing_required?: "fail" | "skip" | undefined;
    } | undefined;
    thresholds?: {
        warn?: number | undefined;
        risk?: number | undefined;
    } | undefined;
    input_relevance?: {
        disposition: "advisory" | "blocking" | "irrelevant";
        pattern: string;
        reason?: string | undefined;
    }[] | undefined;
    availability?: "fail_open" | "fail_closed" | undefined;
}>;
export type TrailheadContext = z.infer<typeof TrailheadContext>;
export declare const GateConfig: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["release-ready", "advisory", "risk-only"]>>;
    check_name: z.ZodOptional<z.ZodString>;
    agent_brief: z.ZodOptional<z.ZodEnum<["off", "collapsed", "expanded"]>>;
}, "strip", z.ZodTypeAny, {
    mode: "release-ready" | "advisory" | "risk-only";
    check_name?: string | undefined;
    agent_brief?: "off" | "collapsed" | "expanded" | undefined;
}, {
    mode?: "release-ready" | "advisory" | "risk-only" | undefined;
    check_name?: string | undefined;
    agent_brief?: "off" | "collapsed" | "expanded" | undefined;
}>;
export type GateConfig = z.infer<typeof GateConfig>;
export declare const RemediationConfig: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    max_loop_rounds: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    max_loop_rounds: number;
    enabled: boolean;
}, {
    max_loop_rounds?: number | undefined;
    enabled?: boolean | undefined;
}>;
export type RemediationConfig = z.infer<typeof RemediationConfig>;
export declare const RiskPathProfileConfig: z.ZodObject<{
    /** Extra globs excluded from sensitive_files + test_coverage (not file_count/churn). */
    non_source_globs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Move structural size factors out of the blocking risk average while still reporting them. */
    size_factors: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["risk", "metadata"]>>;
        factors: z.ZodDefault<z.ZodArray<z.ZodEnum<["file_count", "code_churn"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        factors: ("code_churn" | "file_count")[];
        mode: "metadata" | "risk";
    }, {
        factors?: ("code_churn" | "file_count")[] | undefined;
        mode?: "metadata" | "risk" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    non_source_globs: string[];
    size_factors: {
        factors: ("code_churn" | "file_count")[];
        mode: "metadata" | "risk";
    };
}, {
    non_source_globs?: string[] | undefined;
    size_factors?: {
        factors?: ("code_churn" | "file_count")[] | undefined;
        mode?: "metadata" | "risk" | undefined;
    } | undefined;
}>;
export type RiskPathProfileConfig = z.infer<typeof RiskPathProfileConfig>;
export declare const OverrideConfig: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    max_per_week: z.ZodDefault<z.ZodNumber>;
    scope: z.ZodDefault<z.ZodEnum<["full", "risk_only"]>>;
}, "strip", z.ZodTypeAny, {
    scope: "full" | "risk_only";
    enabled: boolean;
    max_per_week: number;
}, {
    scope?: "full" | "risk_only" | undefined;
    enabled?: boolean | undefined;
    max_per_week?: number | undefined;
}>;
export type OverrideConfig = z.infer<typeof OverrideConfig>;
export declare const TuningConfig: z.ZodObject<{
    auto_downgrade: z.ZodDefault<z.ZodBoolean>;
    digest_webhook_url: z.ZodOptional<z.ZodString>;
    fp_threshold: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    auto_downgrade: boolean;
    fp_threshold: number;
    digest_webhook_url?: string | undefined;
}, {
    auto_downgrade?: boolean | undefined;
    digest_webhook_url?: string | undefined;
    fp_threshold?: number | undefined;
}>;
export type TuningConfig = z.infer<typeof TuningConfig>;
export declare const SubmissionDetectorPolicyEntry: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    severity: z.ZodOptional<z.ZodEnum<["block", "warn", "advisory", "blocking"]>>;
    file_globs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    path_ignore: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    weight: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
    enabled?: boolean | undefined;
    file_globs?: string[] | undefined;
    path_ignore?: string[] | undefined;
    weight?: number | undefined;
}, {
    severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
    enabled?: boolean | undefined;
    file_globs?: string[] | undefined;
    path_ignore?: string[] | undefined;
    weight?: number | undefined;
}>;
export type SubmissionDetectorPolicyEntry = z.infer<typeof SubmissionDetectorPolicyEntry>;
export declare const SubmissionRenamePattern: z.ZodObject<{
    old: z.ZodString;
    new: z.ZodString;
}, "strip", z.ZodTypeAny, {
    old: string;
    new: string;
}, {
    old: string;
    new: string;
}>;
export type SubmissionRenamePattern = z.infer<typeof SubmissionRenamePattern>;
export declare const SubmissionConfig: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
    stale_terms: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    auth_route_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Additional function identifiers that prove an API route authenticated. */
    auth_route_helpers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Side-effect-free tombstone routes; each body must still return HTTP 410. */
    retired_route_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    max_file_lines: z.ZodOptional<z.ZodNumber>;
    /** Path substrings to skip for context_freshness (e.g. archived suggestion dirs). */
    path_ignore: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Legacy naming allowlist — skip stale-term hits on imports, slugs in strings, etc. */
    naming_allowlist: z.ZodOptional<z.ZodObject<{
        skip_extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skip_path_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skip_comment_markers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skip_in_imports: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        skip_extensions?: string[] | undefined;
        skip_path_patterns?: string[] | undefined;
        skip_comment_markers?: string[] | undefined;
        skip_in_imports?: boolean | undefined;
    }, {
        skip_extensions?: string[] | undefined;
        skip_path_patterns?: string[] | undefined;
        skip_comment_markers?: string[] | undefined;
        skip_in_imports?: boolean | undefined;
    }>>;
    /** Project rename vocabulary — extends Komatik defaults when KOMATIK_INSTANCE=true. */
    rename_patterns: z.ZodOptional<z.ZodArray<z.ZodObject<{
        old: z.ZodString;
        new: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        old: string;
        new: string;
    }, {
        old: string;
        new: string;
    }>, "many">>;
    /** Extra slug-only regex sources (merged with product defaults). */
    slug_only_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Per-detector policy overrides (enable/severity/file scope). */
    detectors: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        severity: z.ZodOptional<z.ZodEnum<["block", "warn", "advisory", "blocking"]>>;
        file_globs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        path_ignore: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
        enabled?: boolean | undefined;
        file_globs?: string[] | undefined;
        path_ignore?: string[] | undefined;
        weight?: number | undefined;
    }, {
        severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
        enabled?: boolean | undefined;
        file_globs?: string[] | undefined;
        path_ignore?: string[] | undefined;
        weight?: number | undefined;
    }>>>;
    /** contract_integrity (ADR-010): cross-repo catalog resolution. */
    contract_integrity: z.ZodOptional<z.ZodObject<{
        /** Entity names published org-wide; lets cross-repo contract refs resolve. */
        known_entities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Path to a JSON catalog index ({ entities: string[] }), merged with known_entities. */
        catalog_index_path: z.ZodOptional<z.ZodString>;
        /** entity name → "owner/repo" that should publish it. Resolution registry
         * for the cross-repo PR opener: a dangling consumesApis/dependsOn ref whose
         * name is mapped here triggers a declaration PR in the owning repo. */
        api_owners: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        /** Path to a catalog index JSON with an `owners` map; merged with api_owners
         * (inline api_owners wins). Usually the same file as catalog_index_path. */
        api_owners_path: z.ZodOptional<z.ZodString>;
        /** Cross-repo PR opener (ADR-010). Off by default; opens declaration PRs in
         * the OWNING repo for dangling cross-repo contract refs. Needs a token with
         * write access to those repos (cross-repo-token input). */
        cross_repo_opener: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            /** Owners the opener may open PRs in. Defaults to the gated repo's owner. */
            owner_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            owner_allowlist?: string[] | undefined;
        }, {
            enabled?: boolean | undefined;
            owner_allowlist?: string[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        known_entities?: string[] | undefined;
        catalog_index_path?: string | undefined;
        api_owners?: Record<string, string> | undefined;
        api_owners_path?: string | undefined;
        cross_repo_opener?: {
            enabled: boolean;
            owner_allowlist?: string[] | undefined;
        } | undefined;
    }, {
        known_entities?: string[] | undefined;
        catalog_index_path?: string | undefined;
        api_owners?: Record<string, string> | undefined;
        api_owners_path?: string | undefined;
        cross_repo_opener?: {
            enabled?: boolean | undefined;
            owner_allowlist?: string[] | undefined;
        } | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    mode: "warn" | "block";
    contract_integrity?: {
        known_entities?: string[] | undefined;
        catalog_index_path?: string | undefined;
        api_owners?: Record<string, string> | undefined;
        api_owners_path?: string | undefined;
        cross_repo_opener?: {
            enabled: boolean;
            owner_allowlist?: string[] | undefined;
        } | undefined;
    } | undefined;
    path_ignore?: string[] | undefined;
    stale_terms?: string[] | undefined;
    auth_route_allowlist?: string[] | undefined;
    auth_route_helpers?: string[] | undefined;
    retired_route_allowlist?: string[] | undefined;
    max_file_lines?: number | undefined;
    naming_allowlist?: {
        skip_extensions?: string[] | undefined;
        skip_path_patterns?: string[] | undefined;
        skip_comment_markers?: string[] | undefined;
        skip_in_imports?: boolean | undefined;
    } | undefined;
    rename_patterns?: {
        old: string;
        new: string;
    }[] | undefined;
    slug_only_patterns?: string[] | undefined;
    detectors?: Record<string, {
        severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
        enabled?: boolean | undefined;
        file_globs?: string[] | undefined;
        path_ignore?: string[] | undefined;
        weight?: number | undefined;
    }> | undefined;
}, {
    contract_integrity?: {
        known_entities?: string[] | undefined;
        catalog_index_path?: string | undefined;
        api_owners?: Record<string, string> | undefined;
        api_owners_path?: string | undefined;
        cross_repo_opener?: {
            enabled?: boolean | undefined;
            owner_allowlist?: string[] | undefined;
        } | undefined;
    } | undefined;
    enabled?: boolean | undefined;
    mode?: "warn" | "block" | undefined;
    path_ignore?: string[] | undefined;
    stale_terms?: string[] | undefined;
    auth_route_allowlist?: string[] | undefined;
    auth_route_helpers?: string[] | undefined;
    retired_route_allowlist?: string[] | undefined;
    max_file_lines?: number | undefined;
    naming_allowlist?: {
        skip_extensions?: string[] | undefined;
        skip_path_patterns?: string[] | undefined;
        skip_comment_markers?: string[] | undefined;
        skip_in_imports?: boolean | undefined;
    } | undefined;
    rename_patterns?: {
        old: string;
        new: string;
    }[] | undefined;
    slug_only_patterns?: string[] | undefined;
    detectors?: Record<string, {
        severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
        enabled?: boolean | undefined;
        file_globs?: string[] | undefined;
        path_ignore?: string[] | undefined;
        weight?: number | undefined;
    }> | undefined;
}>;
export type SubmissionConfig = z.infer<typeof SubmissionConfig>;
export declare const RepoConfig: z.ZodObject<{
    schema_version: z.ZodDefault<z.ZodNumber>;
    gate: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["release-ready", "advisory", "risk-only"]>>;
        check_name: z.ZodOptional<z.ZodString>;
        agent_brief: z.ZodOptional<z.ZodEnum<["off", "collapsed", "expanded"]>>;
    }, "strip", z.ZodTypeAny, {
        mode: "release-ready" | "advisory" | "risk-only";
        check_name?: string | undefined;
        agent_brief?: "off" | "collapsed" | "expanded" | undefined;
    }, {
        mode?: "release-ready" | "advisory" | "risk-only" | undefined;
        check_name?: string | undefined;
        agent_brief?: "off" | "collapsed" | "expanded" | undefined;
    }>>;
    risk: z.ZodOptional<z.ZodObject<{
        /** Extra globs excluded from sensitive_files + test_coverage (not file_count/churn). */
        non_source_globs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Move structural size factors out of the blocking risk average while still reporting them. */
        size_factors: z.ZodDefault<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<["risk", "metadata"]>>;
            factors: z.ZodDefault<z.ZodArray<z.ZodEnum<["file_count", "code_churn"]>, "many">>;
        }, "strip", z.ZodTypeAny, {
            factors: ("code_churn" | "file_count")[];
            mode: "metadata" | "risk";
        }, {
            factors?: ("code_churn" | "file_count")[] | undefined;
            mode?: "metadata" | "risk" | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        non_source_globs: string[];
        size_factors: {
            factors: ("code_churn" | "file_count")[];
            mode: "metadata" | "risk";
        };
    }, {
        non_source_globs?: string[] | undefined;
        size_factors?: {
            factors?: ("code_churn" | "file_count")[] | undefined;
            mode?: "metadata" | "risk" | undefined;
        } | undefined;
    }>>;
    remediation: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_loop_rounds: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        max_loop_rounds: number;
        enabled: boolean;
    }, {
        max_loop_rounds?: number | undefined;
        enabled?: boolean | undefined;
    }>>;
    override: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_per_week: z.ZodDefault<z.ZodNumber>;
        scope: z.ZodDefault<z.ZodEnum<["full", "risk_only"]>>;
    }, "strip", z.ZodTypeAny, {
        scope: "full" | "risk_only";
        enabled: boolean;
        max_per_week: number;
    }, {
        scope?: "full" | "risk_only" | undefined;
        enabled?: boolean | undefined;
        max_per_week?: number | undefined;
    }>>;
    tuning: z.ZodOptional<z.ZodObject<{
        auto_downgrade: z.ZodDefault<z.ZodBoolean>;
        digest_webhook_url: z.ZodOptional<z.ZodString>;
        fp_threshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        auto_downgrade: boolean;
        fp_threshold: number;
        digest_webhook_url?: string | undefined;
    }, {
        auto_downgrade?: boolean | undefined;
        digest_webhook_url?: string | undefined;
        fp_threshold?: number | undefined;
    }>>;
    submission: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
        stale_terms: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        auth_route_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Additional function identifiers that prove an API route authenticated. */
        auth_route_helpers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Side-effect-free tombstone routes; each body must still return HTTP 410. */
        retired_route_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        max_file_lines: z.ZodOptional<z.ZodNumber>;
        /** Path substrings to skip for context_freshness (e.g. archived suggestion dirs). */
        path_ignore: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Legacy naming allowlist — skip stale-term hits on imports, slugs in strings, etc. */
        naming_allowlist: z.ZodOptional<z.ZodObject<{
            skip_extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skip_path_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skip_comment_markers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            skip_in_imports: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            skip_extensions?: string[] | undefined;
            skip_path_patterns?: string[] | undefined;
            skip_comment_markers?: string[] | undefined;
            skip_in_imports?: boolean | undefined;
        }, {
            skip_extensions?: string[] | undefined;
            skip_path_patterns?: string[] | undefined;
            skip_comment_markers?: string[] | undefined;
            skip_in_imports?: boolean | undefined;
        }>>;
        /** Project rename vocabulary — extends Komatik defaults when KOMATIK_INSTANCE=true. */
        rename_patterns: z.ZodOptional<z.ZodArray<z.ZodObject<{
            old: z.ZodString;
            new: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            old: string;
            new: string;
        }, {
            old: string;
            new: string;
        }>, "many">>;
        /** Extra slug-only regex sources (merged with product defaults). */
        slug_only_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Per-detector policy overrides (enable/severity/file scope). */
        detectors: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            severity: z.ZodOptional<z.ZodEnum<["block", "warn", "advisory", "blocking"]>>;
            file_globs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            path_ignore: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            weight: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
            enabled?: boolean | undefined;
            file_globs?: string[] | undefined;
            path_ignore?: string[] | undefined;
            weight?: number | undefined;
        }, {
            severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
            enabled?: boolean | undefined;
            file_globs?: string[] | undefined;
            path_ignore?: string[] | undefined;
            weight?: number | undefined;
        }>>>;
        /** contract_integrity (ADR-010): cross-repo catalog resolution. */
        contract_integrity: z.ZodOptional<z.ZodObject<{
            /** Entity names published org-wide; lets cross-repo contract refs resolve. */
            known_entities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /** Path to a JSON catalog index ({ entities: string[] }), merged with known_entities. */
            catalog_index_path: z.ZodOptional<z.ZodString>;
            /** entity name → "owner/repo" that should publish it. Resolution registry
             * for the cross-repo PR opener: a dangling consumesApis/dependsOn ref whose
             * name is mapped here triggers a declaration PR in the owning repo. */
            api_owners: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            /** Path to a catalog index JSON with an `owners` map; merged with api_owners
             * (inline api_owners wins). Usually the same file as catalog_index_path. */
            api_owners_path: z.ZodOptional<z.ZodString>;
            /** Cross-repo PR opener (ADR-010). Off by default; opens declaration PRs in
             * the OWNING repo for dangling cross-repo contract refs. Needs a token with
             * write access to those repos (cross-repo-token input). */
            cross_repo_opener: z.ZodOptional<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                /** Owners the opener may open PRs in. Defaults to the gated repo's owner. */
                owner_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                enabled: boolean;
                owner_allowlist?: string[] | undefined;
            }, {
                enabled?: boolean | undefined;
                owner_allowlist?: string[] | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            known_entities?: string[] | undefined;
            catalog_index_path?: string | undefined;
            api_owners?: Record<string, string> | undefined;
            api_owners_path?: string | undefined;
            cross_repo_opener?: {
                enabled: boolean;
                owner_allowlist?: string[] | undefined;
            } | undefined;
        }, {
            known_entities?: string[] | undefined;
            catalog_index_path?: string | undefined;
            api_owners?: Record<string, string> | undefined;
            api_owners_path?: string | undefined;
            cross_repo_opener?: {
                enabled?: boolean | undefined;
                owner_allowlist?: string[] | undefined;
            } | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        mode: "warn" | "block";
        contract_integrity?: {
            known_entities?: string[] | undefined;
            catalog_index_path?: string | undefined;
            api_owners?: Record<string, string> | undefined;
            api_owners_path?: string | undefined;
            cross_repo_opener?: {
                enabled: boolean;
                owner_allowlist?: string[] | undefined;
            } | undefined;
        } | undefined;
        path_ignore?: string[] | undefined;
        stale_terms?: string[] | undefined;
        auth_route_allowlist?: string[] | undefined;
        auth_route_helpers?: string[] | undefined;
        retired_route_allowlist?: string[] | undefined;
        max_file_lines?: number | undefined;
        naming_allowlist?: {
            skip_extensions?: string[] | undefined;
            skip_path_patterns?: string[] | undefined;
            skip_comment_markers?: string[] | undefined;
            skip_in_imports?: boolean | undefined;
        } | undefined;
        rename_patterns?: {
            old: string;
            new: string;
        }[] | undefined;
        slug_only_patterns?: string[] | undefined;
        detectors?: Record<string, {
            severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
            enabled?: boolean | undefined;
            file_globs?: string[] | undefined;
            path_ignore?: string[] | undefined;
            weight?: number | undefined;
        }> | undefined;
    }, {
        contract_integrity?: {
            known_entities?: string[] | undefined;
            catalog_index_path?: string | undefined;
            api_owners?: Record<string, string> | undefined;
            api_owners_path?: string | undefined;
            cross_repo_opener?: {
                enabled?: boolean | undefined;
                owner_allowlist?: string[] | undefined;
            } | undefined;
        } | undefined;
        enabled?: boolean | undefined;
        mode?: "warn" | "block" | undefined;
        path_ignore?: string[] | undefined;
        stale_terms?: string[] | undefined;
        auth_route_allowlist?: string[] | undefined;
        auth_route_helpers?: string[] | undefined;
        retired_route_allowlist?: string[] | undefined;
        max_file_lines?: number | undefined;
        naming_allowlist?: {
            skip_extensions?: string[] | undefined;
            skip_path_patterns?: string[] | undefined;
            skip_comment_markers?: string[] | undefined;
            skip_in_imports?: boolean | undefined;
        } | undefined;
        rename_patterns?: {
            old: string;
            new: string;
        }[] | undefined;
        slug_only_patterns?: string[] | undefined;
        detectors?: Record<string, {
            severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
            enabled?: boolean | undefined;
            file_globs?: string[] | undefined;
            path_ignore?: string[] | undefined;
            weight?: number | undefined;
        }> | undefined;
    }>>;
    contexts: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        match: z.ZodObject<{
            base_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            head_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            labels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            base_branch: string[];
            head_branch: string[];
            labels: string[];
        }, {
            base_branch?: string[] | undefined;
            head_branch?: string[] | undefined;
            labels?: string[] | undefined;
        }>;
        environment: z.ZodOptional<z.ZodString>;
        thresholds: z.ZodDefault<z.ZodObject<{
            risk: z.ZodOptional<z.ZodNumber>;
            warn: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            warn?: number | undefined;
            risk?: number | undefined;
        }, {
            warn?: number | undefined;
            risk?: number | undefined;
        }>>;
        ci: z.ZodDefault<z.ZodObject<{
            required_checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            optional_checks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            missing_required: z.ZodDefault<z.ZodEnum<["fail", "skip"]>>;
        }, "strip", z.ZodTypeAny, {
            required_checks: string[];
            optional_checks: string[];
            missing_required: "fail" | "skip";
        }, {
            required_checks?: string[] | undefined;
            optional_checks?: string[] | undefined;
            missing_required?: "fail" | "skip" | undefined;
        }>>;
        input_relevance: z.ZodDefault<z.ZodArray<z.ZodObject<{
            pattern: z.ZodString;
            disposition: z.ZodEnum<["blocking", "advisory", "irrelevant"]>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            disposition: "advisory" | "blocking" | "irrelevant";
            pattern: string;
            reason?: string | undefined;
        }, {
            disposition: "advisory" | "blocking" | "irrelevant";
            pattern: string;
            reason?: string | undefined;
        }>, "many">>;
        availability: z.ZodOptional<z.ZodEnum<["fail_open", "fail_closed"]>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        match: {
            base_branch: string[];
            head_branch: string[];
            labels: string[];
        };
        ci: {
            required_checks: string[];
            optional_checks: string[];
            missing_required: "fail" | "skip";
        };
        thresholds: {
            warn?: number | undefined;
            risk?: number | undefined;
        };
        input_relevance: {
            disposition: "advisory" | "blocking" | "irrelevant";
            pattern: string;
            reason?: string | undefined;
        }[];
        environment?: string | undefined;
        availability?: "fail_open" | "fail_closed" | undefined;
    }, {
        name: string;
        match: {
            base_branch?: string[] | undefined;
            head_branch?: string[] | undefined;
            labels?: string[] | undefined;
        };
        environment?: string | undefined;
        ci?: {
            required_checks?: string[] | undefined;
            optional_checks?: string[] | undefined;
            missing_required?: "fail" | "skip" | undefined;
        } | undefined;
        thresholds?: {
            warn?: number | undefined;
            risk?: number | undefined;
        } | undefined;
        input_relevance?: {
            disposition: "advisory" | "blocking" | "irrelevant";
            pattern: string;
            reason?: string | undefined;
        }[] | undefined;
        availability?: "fail_open" | "fail_closed" | undefined;
    }>, "many">>;
    sensitivity: z.ZodDefault<z.ZodObject<{
        high: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        medium: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        low: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        high: string[];
        medium: string[];
        low: string[];
    }, {
        high?: string[] | undefined;
        medium?: string[] | undefined;
        low?: string[] | undefined;
    }>>;
    weights: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    profiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        match: z.ZodObject<{
            files_include: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            files_exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            min_files: z.ZodOptional<z.ZodNumber>;
            max_files: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            files_include: string[];
            files_exclude: string[];
            min_files?: number | undefined;
            max_files?: number | undefined;
        }, {
            files_include?: string[] | undefined;
            files_exclude?: string[] | undefined;
            min_files?: number | undefined;
            max_files?: number | undefined;
        }>;
        weights: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        match: {
            files_include: string[];
            files_exclude: string[];
            min_files?: number | undefined;
            max_files?: number | undefined;
        };
        weights: Record<string, number>;
        name?: string | undefined;
    }, {
        match: {
            files_include?: string[] | undefined;
            files_exclude?: string[] | undefined;
            min_files?: number | undefined;
            max_files?: number | undefined;
        };
        name?: string | undefined;
        weights?: Record<string, number> | undefined;
    }>, "many">>;
    thresholds: z.ZodDefault<z.ZodObject<{
        risk: z.ZodOptional<z.ZodNumber>;
        warn: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        warn?: number | undefined;
        risk?: number | undefined;
    }, {
        warn?: number | undefined;
        risk?: number | undefined;
    }>>;
    ignore: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    freeze: z.ZodDefault<z.ZodArray<z.ZodObject<{
        days: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        afterHour: z.ZodOptional<z.ZodNumber>;
        beforeHour: z.ZodOptional<z.ZodNumber>;
        timezone: z.ZodDefault<z.ZodString>;
        message: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        days: string[];
        timezone: string;
        message?: string | undefined;
        afterHour?: number | undefined;
        beforeHour?: number | undefined;
    }, {
        message?: string | undefined;
        days?: string[] | undefined;
        afterHour?: number | undefined;
        beforeHour?: number | undefined;
        timezone?: string | undefined;
    }>, "many">>;
    environments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        risk: z.ZodOptional<z.ZodNumber>;
        warn: z.ZodOptional<z.ZodNumber>;
        require_security_clear: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        warn?: number | undefined;
        risk?: number | undefined;
        require_security_clear?: boolean | undefined;
    }, {
        warn?: number | undefined;
        risk?: number | undefined;
        require_security_clear?: boolean | undefined;
    }>>>;
    services: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        paths: z.ZodArray<z.ZodString, "many">;
        environment: z.ZodOptional<z.ZodString>;
        consumers: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            repo: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            branch: z.ZodOptional<z.ZodString>;
            notify_webhook: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            repo: string;
            name?: string | undefined;
            branch?: string | undefined;
            notify_webhook?: string | undefined;
        }, {
            repo: string;
            name?: string | undefined;
            branch?: string | undefined;
            notify_webhook?: string | undefined;
        }>]>, "many">>;
        contracts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notify_webhook: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        consumers: (string | {
            repo: string;
            name?: string | undefined;
            branch?: string | undefined;
            notify_webhook?: string | undefined;
        })[];
        paths: string[];
        contracts: string[];
        environment?: string | undefined;
        notify_webhook?: string | undefined;
    }, {
        paths: string[];
        environment?: string | undefined;
        consumers?: (string | {
            repo: string;
            name?: string | undefined;
            branch?: string | undefined;
            notify_webhook?: string | undefined;
        })[] | undefined;
        notify_webhook?: string | undefined;
        contracts?: string[] | undefined;
    }>>>;
    consumer_registry: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        repo: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
        notify_webhook: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    }, {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    }>>>;
    security: z.ZodDefault<z.ZodObject<{
        severity_threshold: z.ZodDefault<z.ZodEnum<["error", "warning", "note", "none"]>>;
        block_on_critical: z.ZodDefault<z.ZodBoolean>;
        ignore_rules: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        severity_threshold: "error" | "warning" | "note" | "none";
        block_on_critical: boolean;
        ignore_rules: string[];
    }, {
        severity_threshold?: "error" | "warning" | "note" | "none" | undefined;
        block_on_critical?: boolean | undefined;
        ignore_rules?: string[] | undefined;
    }>>;
    canary: z.ZodOptional<z.ZodObject<{
        webhook_type: z.ZodDefault<z.ZodEnum<["vercel", "generic"]>>;
        field_map: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        rollback_on_failure: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        webhook_type: "vercel" | "generic";
        rollback_on_failure: boolean;
        field_map?: Record<string, string> | undefined;
    }, {
        webhook_type?: "vercel" | "generic" | undefined;
        field_map?: Record<string, string> | undefined;
        rollback_on_failure?: boolean | undefined;
    }>>;
    escalation: z.ZodDefault<z.ZodObject<{
        targets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        acknowledge_sla_minutes: z.ZodDefault<z.ZodNumber>;
        resolve_sla_minutes: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        acknowledge_sla_minutes: number;
        resolve_sla_minutes: number;
        targets: string[];
    }, {
        acknowledge_sla_minutes?: number | undefined;
        resolve_sla_minutes?: number | undefined;
        targets?: string[] | undefined;
    }>>;
    policies: z.ZodDefault<z.ZodObject<{
        agent_prs: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
            risk_threshold: z.ZodOptional<z.ZodNumber>;
            risk_threshold_exempt_contexts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            required_approvals: z.ZodDefault<z.ZodNumber>;
            require_code_owner_approval: z.ZodDefault<z.ZodBoolean>;
            code_owner_reviewers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            sensitive_paths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            strict_on_unknown_provenance: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
            risk_threshold_exempt_contexts: string[];
            required_approvals: number;
            require_code_owner_approval: boolean;
            code_owner_reviewers: string[];
            sensitive_paths: string[];
            strict_on_unknown_provenance: boolean;
            risk_threshold?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            risk_threshold?: number | undefined;
            risk_threshold_exempt_contexts?: string[] | undefined;
            required_approvals?: number | undefined;
            require_code_owner_approval?: boolean | undefined;
            code_owner_reviewers?: string[] | undefined;
            sensitive_paths?: string[] | undefined;
            strict_on_unknown_provenance?: boolean | undefined;
        }>>;
        session_correlation: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            threshold: z.ZodDefault<z.ZodNumber>;
            window_minutes: z.ZodDefault<z.ZodNumber>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
            threshold: number;
            window_minutes: number;
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            threshold?: number | undefined;
            window_minutes?: number | undefined;
        }>>;
        ci_integrity: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        }>>;
        workflow_security: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
            allow_unpinned_actions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
            allow_unpinned_actions: string[];
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            allow_unpinned_actions?: string[] | undefined;
        }>>;
        prompt_injection: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        }>>;
        supply_chain: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
            force_score_on_critical: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
            force_score_on_critical: number;
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            force_score_on_critical?: number | undefined;
        }>>;
        pr_scope: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            max_files: z.ZodDefault<z.ZodNumber>;
            max_changes: z.ZodDefault<z.ZodNumber>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
            require_plan_for_agent_prs: z.ZodDefault<z.ZodBoolean>;
            exempt: z.ZodDefault<z.ZodArray<z.ZodObject<{
                head_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                base_branch: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                base_branch: string[];
                head_branch: string[];
            }, {
                base_branch?: string[] | undefined;
                head_branch?: string[] | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            max_files: number;
            mode: "warn" | "block";
            max_changes: number;
            require_plan_for_agent_prs: boolean;
            exempt: {
                base_branch: string[];
                head_branch: string[];
            }[];
        }, {
            enabled?: boolean | undefined;
            max_files?: number | undefined;
            mode?: "warn" | "block" | undefined;
            max_changes?: number | undefined;
            require_plan_for_agent_prs?: boolean | undefined;
            exempt?: {
                base_branch?: string[] | undefined;
                head_branch?: string[] | undefined;
            }[] | undefined;
        }>>;
        duplicate_logic: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        }>>;
        cross_repo_impact: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
            consumer_registry_path: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
            consumer_registry_path?: string | undefined;
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            consumer_registry_path?: string | undefined;
        }>>;
        sensitive_files: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            mode: z.ZodDefault<z.ZodEnum<["warn", "block"]>>;
            threshold: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            mode: "warn" | "block";
            threshold: number;
        }, {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            threshold?: number | undefined;
        }>>;
        risk_factor_severity: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            critical: z.ZodOptional<z.ZodNumber>;
            high: z.ZodOptional<z.ZodNumber>;
            medium: z.ZodOptional<z.ZodNumber>;
            low: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            critical?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            critical?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        sensitive_files: {
            enabled: boolean;
            mode: "warn" | "block";
            threshold: number;
        };
        ci_integrity: {
            enabled: boolean;
            mode: "warn" | "block";
        };
        workflow_security: {
            enabled: boolean;
            mode: "warn" | "block";
            allow_unpinned_actions: string[];
        };
        supply_chain: {
            enabled: boolean;
            mode: "warn" | "block";
            force_score_on_critical: number;
        };
        pr_scope: {
            enabled: boolean;
            max_files: number;
            mode: "warn" | "block";
            max_changes: number;
            require_plan_for_agent_prs: boolean;
            exempt: {
                base_branch: string[];
                head_branch: string[];
            }[];
        };
        duplicate_logic: {
            enabled: boolean;
            mode: "warn" | "block";
        };
        cross_repo_impact: {
            enabled: boolean;
            mode: "warn" | "block";
            consumer_registry_path?: string | undefined;
        };
        session_correlation: {
            enabled: boolean;
            mode: "warn" | "block";
            threshold: number;
            window_minutes: number;
        };
        agent_prs: {
            enabled: boolean;
            mode: "warn" | "block";
            risk_threshold_exempt_contexts: string[];
            required_approvals: number;
            require_code_owner_approval: boolean;
            code_owner_reviewers: string[];
            sensitive_paths: string[];
            strict_on_unknown_provenance: boolean;
            risk_threshold?: number | undefined;
        };
        prompt_injection: {
            enabled: boolean;
            mode: "warn" | "block";
        };
        risk_factor_severity?: {
            enabled: boolean;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            critical?: number | undefined;
        } | undefined;
    }, {
        sensitive_files?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            threshold?: number | undefined;
        } | undefined;
        ci_integrity?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        } | undefined;
        workflow_security?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            allow_unpinned_actions?: string[] | undefined;
        } | undefined;
        supply_chain?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            force_score_on_critical?: number | undefined;
        } | undefined;
        pr_scope?: {
            enabled?: boolean | undefined;
            max_files?: number | undefined;
            mode?: "warn" | "block" | undefined;
            max_changes?: number | undefined;
            require_plan_for_agent_prs?: boolean | undefined;
            exempt?: {
                base_branch?: string[] | undefined;
                head_branch?: string[] | undefined;
            }[] | undefined;
        } | undefined;
        duplicate_logic?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        } | undefined;
        cross_repo_impact?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            consumer_registry_path?: string | undefined;
        } | undefined;
        session_correlation?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            threshold?: number | undefined;
            window_minutes?: number | undefined;
        } | undefined;
        agent_prs?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            risk_threshold?: number | undefined;
            risk_threshold_exempt_contexts?: string[] | undefined;
            required_approvals?: number | undefined;
            require_code_owner_approval?: boolean | undefined;
            code_owner_reviewers?: string[] | undefined;
            sensitive_paths?: string[] | undefined;
            strict_on_unknown_provenance?: boolean | undefined;
        } | undefined;
        prompt_injection?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        } | undefined;
        risk_factor_severity?: {
            enabled?: boolean | undefined;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            critical?: number | undefined;
        } | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    schema_version: number;
    services: Record<string, {
        consumers: (string | {
            repo: string;
            name?: string | undefined;
            branch?: string | undefined;
            notify_webhook?: string | undefined;
        })[];
        paths: string[];
        contracts: string[];
        environment?: string | undefined;
        notify_webhook?: string | undefined;
    }>;
    weights: Record<string, number>;
    thresholds: {
        warn?: number | undefined;
        risk?: number | undefined;
    };
    gate: {
        mode: "release-ready" | "advisory" | "risk-only";
        check_name?: string | undefined;
        agent_brief?: "off" | "collapsed" | "expanded" | undefined;
    };
    contexts: {
        name: string;
        match: {
            base_branch: string[];
            head_branch: string[];
            labels: string[];
        };
        ci: {
            required_checks: string[];
            optional_checks: string[];
            missing_required: "fail" | "skip";
        };
        thresholds: {
            warn?: number | undefined;
            risk?: number | undefined;
        };
        input_relevance: {
            disposition: "advisory" | "blocking" | "irrelevant";
            pattern: string;
            reason?: string | undefined;
        }[];
        environment?: string | undefined;
        availability?: "fail_open" | "fail_closed" | undefined;
    }[];
    sensitivity: {
        high: string[];
        medium: string[];
        low: string[];
    };
    profiles: {
        match: {
            files_include: string[];
            files_exclude: string[];
            min_files?: number | undefined;
            max_files?: number | undefined;
        };
        weights: Record<string, number>;
        name?: string | undefined;
    }[];
    ignore: string[];
    freeze: {
        days: string[];
        timezone: string;
        message?: string | undefined;
        afterHour?: number | undefined;
        beforeHour?: number | undefined;
    }[];
    environments: Record<string, {
        warn?: number | undefined;
        risk?: number | undefined;
        require_security_clear?: boolean | undefined;
    }>;
    consumer_registry: Record<string, {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    }>;
    security: {
        severity_threshold: "error" | "warning" | "note" | "none";
        block_on_critical: boolean;
        ignore_rules: string[];
    };
    escalation: {
        acknowledge_sla_minutes: number;
        resolve_sla_minutes: number;
        targets: string[];
    };
    policies: {
        sensitive_files: {
            enabled: boolean;
            mode: "warn" | "block";
            threshold: number;
        };
        ci_integrity: {
            enabled: boolean;
            mode: "warn" | "block";
        };
        workflow_security: {
            enabled: boolean;
            mode: "warn" | "block";
            allow_unpinned_actions: string[];
        };
        supply_chain: {
            enabled: boolean;
            mode: "warn" | "block";
            force_score_on_critical: number;
        };
        pr_scope: {
            enabled: boolean;
            max_files: number;
            mode: "warn" | "block";
            max_changes: number;
            require_plan_for_agent_prs: boolean;
            exempt: {
                base_branch: string[];
                head_branch: string[];
            }[];
        };
        duplicate_logic: {
            enabled: boolean;
            mode: "warn" | "block";
        };
        cross_repo_impact: {
            enabled: boolean;
            mode: "warn" | "block";
            consumer_registry_path?: string | undefined;
        };
        session_correlation: {
            enabled: boolean;
            mode: "warn" | "block";
            threshold: number;
            window_minutes: number;
        };
        agent_prs: {
            enabled: boolean;
            mode: "warn" | "block";
            risk_threshold_exempt_contexts: string[];
            required_approvals: number;
            require_code_owner_approval: boolean;
            code_owner_reviewers: string[];
            sensitive_paths: string[];
            strict_on_unknown_provenance: boolean;
            risk_threshold?: number | undefined;
        };
        prompt_injection: {
            enabled: boolean;
            mode: "warn" | "block";
        };
        risk_factor_severity?: {
            enabled: boolean;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            critical?: number | undefined;
        } | undefined;
    };
    override?: {
        scope: "full" | "risk_only";
        enabled: boolean;
        max_per_week: number;
    } | undefined;
    remediation?: {
        max_loop_rounds: number;
        enabled: boolean;
    } | undefined;
    risk?: {
        non_source_globs: string[];
        size_factors: {
            factors: ("code_churn" | "file_count")[];
            mode: "metadata" | "risk";
        };
    } | undefined;
    tuning?: {
        auto_downgrade: boolean;
        fp_threshold: number;
        digest_webhook_url?: string | undefined;
    } | undefined;
    submission?: {
        enabled: boolean;
        mode: "warn" | "block";
        contract_integrity?: {
            known_entities?: string[] | undefined;
            catalog_index_path?: string | undefined;
            api_owners?: Record<string, string> | undefined;
            api_owners_path?: string | undefined;
            cross_repo_opener?: {
                enabled: boolean;
                owner_allowlist?: string[] | undefined;
            } | undefined;
        } | undefined;
        path_ignore?: string[] | undefined;
        stale_terms?: string[] | undefined;
        auth_route_allowlist?: string[] | undefined;
        auth_route_helpers?: string[] | undefined;
        retired_route_allowlist?: string[] | undefined;
        max_file_lines?: number | undefined;
        naming_allowlist?: {
            skip_extensions?: string[] | undefined;
            skip_path_patterns?: string[] | undefined;
            skip_comment_markers?: string[] | undefined;
            skip_in_imports?: boolean | undefined;
        } | undefined;
        rename_patterns?: {
            old: string;
            new: string;
        }[] | undefined;
        slug_only_patterns?: string[] | undefined;
        detectors?: Record<string, {
            severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
            enabled?: boolean | undefined;
            file_globs?: string[] | undefined;
            path_ignore?: string[] | undefined;
            weight?: number | undefined;
        }> | undefined;
    } | undefined;
    canary?: {
        webhook_type: "vercel" | "generic";
        rollback_on_failure: boolean;
        field_map?: Record<string, string> | undefined;
    } | undefined;
}, {
    schema_version?: number | undefined;
    override?: {
        scope?: "full" | "risk_only" | undefined;
        enabled?: boolean | undefined;
        max_per_week?: number | undefined;
    } | undefined;
    remediation?: {
        max_loop_rounds?: number | undefined;
        enabled?: boolean | undefined;
    } | undefined;
    services?: Record<string, {
        paths: string[];
        environment?: string | undefined;
        consumers?: (string | {
            repo: string;
            name?: string | undefined;
            branch?: string | undefined;
            notify_webhook?: string | undefined;
        })[] | undefined;
        notify_webhook?: string | undefined;
        contracts?: string[] | undefined;
    }> | undefined;
    risk?: {
        non_source_globs?: string[] | undefined;
        size_factors?: {
            factors?: ("code_churn" | "file_count")[] | undefined;
            mode?: "metadata" | "risk" | undefined;
        } | undefined;
    } | undefined;
    weights?: Record<string, number> | undefined;
    thresholds?: {
        warn?: number | undefined;
        risk?: number | undefined;
    } | undefined;
    gate?: {
        mode?: "release-ready" | "advisory" | "risk-only" | undefined;
        check_name?: string | undefined;
        agent_brief?: "off" | "collapsed" | "expanded" | undefined;
    } | undefined;
    tuning?: {
        auto_downgrade?: boolean | undefined;
        digest_webhook_url?: string | undefined;
        fp_threshold?: number | undefined;
    } | undefined;
    submission?: {
        contract_integrity?: {
            known_entities?: string[] | undefined;
            catalog_index_path?: string | undefined;
            api_owners?: Record<string, string> | undefined;
            api_owners_path?: string | undefined;
            cross_repo_opener?: {
                enabled?: boolean | undefined;
                owner_allowlist?: string[] | undefined;
            } | undefined;
        } | undefined;
        enabled?: boolean | undefined;
        mode?: "warn" | "block" | undefined;
        path_ignore?: string[] | undefined;
        stale_terms?: string[] | undefined;
        auth_route_allowlist?: string[] | undefined;
        auth_route_helpers?: string[] | undefined;
        retired_route_allowlist?: string[] | undefined;
        max_file_lines?: number | undefined;
        naming_allowlist?: {
            skip_extensions?: string[] | undefined;
            skip_path_patterns?: string[] | undefined;
            skip_comment_markers?: string[] | undefined;
            skip_in_imports?: boolean | undefined;
        } | undefined;
        rename_patterns?: {
            old: string;
            new: string;
        }[] | undefined;
        slug_only_patterns?: string[] | undefined;
        detectors?: Record<string, {
            severity?: "warn" | "block" | "advisory" | "blocking" | undefined;
            enabled?: boolean | undefined;
            file_globs?: string[] | undefined;
            path_ignore?: string[] | undefined;
            weight?: number | undefined;
        }> | undefined;
    } | undefined;
    contexts?: {
        name: string;
        match: {
            base_branch?: string[] | undefined;
            head_branch?: string[] | undefined;
            labels?: string[] | undefined;
        };
        environment?: string | undefined;
        ci?: {
            required_checks?: string[] | undefined;
            optional_checks?: string[] | undefined;
            missing_required?: "fail" | "skip" | undefined;
        } | undefined;
        thresholds?: {
            warn?: number | undefined;
            risk?: number | undefined;
        } | undefined;
        input_relevance?: {
            disposition: "advisory" | "blocking" | "irrelevant";
            pattern: string;
            reason?: string | undefined;
        }[] | undefined;
        availability?: "fail_open" | "fail_closed" | undefined;
    }[] | undefined;
    sensitivity?: {
        high?: string[] | undefined;
        medium?: string[] | undefined;
        low?: string[] | undefined;
    } | undefined;
    profiles?: {
        match: {
            files_include?: string[] | undefined;
            files_exclude?: string[] | undefined;
            min_files?: number | undefined;
            max_files?: number | undefined;
        };
        name?: string | undefined;
        weights?: Record<string, number> | undefined;
    }[] | undefined;
    ignore?: string[] | undefined;
    freeze?: {
        message?: string | undefined;
        days?: string[] | undefined;
        afterHour?: number | undefined;
        beforeHour?: number | undefined;
        timezone?: string | undefined;
    }[] | undefined;
    environments?: Record<string, {
        warn?: number | undefined;
        risk?: number | undefined;
        require_security_clear?: boolean | undefined;
    }> | undefined;
    consumer_registry?: Record<string, {
        repo: string;
        name?: string | undefined;
        branch?: string | undefined;
        notify_webhook?: string | undefined;
    }> | undefined;
    security?: {
        severity_threshold?: "error" | "warning" | "note" | "none" | undefined;
        block_on_critical?: boolean | undefined;
        ignore_rules?: string[] | undefined;
    } | undefined;
    canary?: {
        webhook_type?: "vercel" | "generic" | undefined;
        field_map?: Record<string, string> | undefined;
        rollback_on_failure?: boolean | undefined;
    } | undefined;
    escalation?: {
        acknowledge_sla_minutes?: number | undefined;
        resolve_sla_minutes?: number | undefined;
        targets?: string[] | undefined;
    } | undefined;
    policies?: {
        sensitive_files?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            threshold?: number | undefined;
        } | undefined;
        ci_integrity?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        } | undefined;
        workflow_security?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            allow_unpinned_actions?: string[] | undefined;
        } | undefined;
        supply_chain?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            force_score_on_critical?: number | undefined;
        } | undefined;
        pr_scope?: {
            enabled?: boolean | undefined;
            max_files?: number | undefined;
            mode?: "warn" | "block" | undefined;
            max_changes?: number | undefined;
            require_plan_for_agent_prs?: boolean | undefined;
            exempt?: {
                base_branch?: string[] | undefined;
                head_branch?: string[] | undefined;
            }[] | undefined;
        } | undefined;
        duplicate_logic?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        } | undefined;
        cross_repo_impact?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            consumer_registry_path?: string | undefined;
        } | undefined;
        session_correlation?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            threshold?: number | undefined;
            window_minutes?: number | undefined;
        } | undefined;
        agent_prs?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
            risk_threshold?: number | undefined;
            risk_threshold_exempt_contexts?: string[] | undefined;
            required_approvals?: number | undefined;
            require_code_owner_approval?: boolean | undefined;
            code_owner_reviewers?: string[] | undefined;
            sensitive_paths?: string[] | undefined;
            strict_on_unknown_provenance?: boolean | undefined;
        } | undefined;
        prompt_injection?: {
            enabled?: boolean | undefined;
            mode?: "warn" | "block" | undefined;
        } | undefined;
        risk_factor_severity?: {
            enabled?: boolean | undefined;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            critical?: number | undefined;
        } | undefined;
    } | undefined;
}>;
export type RepoConfig = z.infer<typeof RepoConfig>;
export interface TrailheadConfig {
    apiKey: string;
    apiUrl: string;
    githubToken?: string;
    healthCheckUrls: string[];
    riskThreshold: number;
    warnThreshold?: number;
    failMode: "open" | "closed";
    selfHeal: boolean;
    addRiskLabels: boolean;
    reviewersOnRisk: string[];
    webhookUrl?: string;
    webhookEvents: string[];
    evaluationStoreUrl?: string;
    trailheadApiKey?: string;
    environment?: string;
    securityGate?: boolean;
    gateMode?: GateMode;
    waitForChecks?: boolean;
    waitTimeoutMinutes?: number;
    checkName?: string;
    ciManifest?: CiManifest | null;
    ciManifestPath?: string;
    agentBrief?: AgentBriefMode;
    submissionGate?: boolean;
    disableCloudUpsell?: boolean;
}
export interface TestRepairResult {
    testFile: string;
    failureType: string;
    strategy: string;
    success: boolean;
    diff?: string;
}
