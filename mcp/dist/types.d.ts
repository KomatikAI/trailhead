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
export declare const CiCheckStatusEnum: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
export type CiCheckStatusEnum = z.infer<typeof CiCheckStatusEnum>;
export declare const CiCheck: z.ZodObject<{
    name: z.ZodString;
    status: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
    conclusion: z.ZodOptional<z.ZodString>;
    detailsUrl: z.ZodOptional<z.ZodString>;
    required: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
    name: string;
    required: boolean;
    conclusion?: string | undefined;
    detailsUrl?: string | undefined;
}, {
    status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
    name: string;
    required: boolean;
    conclusion?: string | undefined;
    detailsUrl?: string | undefined;
}>;
export type CiCheck = z.infer<typeof CiCheck>;
export declare const CiSummary: z.ZodObject<{
    checks: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        status: z.ZodEnum<["pass", "fail", "skip", "pending", "stale", "missing"]>;
        conclusion: z.ZodOptional<z.ZodString>;
        detailsUrl: z.ZodOptional<z.ZodString>;
        required: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
        name: string;
        required: boolean;
        conclusion?: string | undefined;
        detailsUrl?: string | undefined;
    }, {
        status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
        name: string;
        required: boolean;
        conclusion?: string | undefined;
        detailsUrl?: string | undefined;
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
export declare const GateEvaluation: z.ZodObject<{
    id: z.ZodString;
    repoId: z.ZodString;
    commitSha: z.ZodString;
    prNumber: z.ZodOptional<z.ZodNumber>;
    healthScore: z.ZodNumber;
    riskScore: z.ZodNumber;
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
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    evaluationMs: z.ZodNumber;
    reportUrl: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodString>;
    service: z.ZodOptional<z.ZodString>;
    policyFindings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
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
    }, "strip", z.ZodTypeAny, {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
    }, {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
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
    }, "strip", z.ZodTypeAny, {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
    }, {
        reason: string;
        strictness: "baseline" | "elevated" | "strict";
    }>>;
    policyOverride: z.ZodOptional<z.ZodObject<{
        owner: z.ZodString;
        reason: z.ZodString;
        linkedTicket: z.ZodString;
        expiresAt: z.ZodString;
        appliedAt: z.ZodString;
        changes: z.ZodDefault<z.ZodObject<{
            failMode: z.ZodOptional<z.ZodEnum<["open", "closed"]>>;
            riskThreshold: z.ZodOptional<z.ZodNumber>;
            warnThreshold: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
        }, {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        changes: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
        };
    }, {
        reason: string;
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        changes?: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
        } | undefined;
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
        }, "strip", z.ZodTypeAny, {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
        }, {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
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
    storePersisted: z.ZodOptional<z.ZodBoolean>;
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
    repoId: string;
    commitSha: string;
    healthScore: number;
    riskScore: number;
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
    prNumber?: number | undefined;
    files?: string[] | undefined;
    reportUrl?: string | undefined;
    service?: string | undefined;
    policyFindings?: string[] | undefined;
    pr?: {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
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
    } | undefined;
    policyOverride?: {
        reason: string;
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        changes: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
        };
    } | undefined;
    releaseReady?: boolean | undefined;
    releaseReadyReasons?: string[] | undefined;
    ci?: {
        checks: {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
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
    storePersisted?: boolean | undefined;
}, {
    id: string;
    repoId: string;
    commitSha: string;
    healthScore: number;
    riskScore: number;
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
    prNumber?: number | undefined;
    files?: string[] | undefined;
    reportUrl?: string | undefined;
    service?: string | undefined;
    policyFindings?: string[] | undefined;
    pr?: {
        provenance?: {
            type: "unknown" | "human" | "dependabot" | "copilot" | "codex" | "claude" | "custom-bot";
            confidence: number;
            source?: string | undefined;
        } | undefined;
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
    } | undefined;
    policyOverride?: {
        reason: string;
        owner: string;
        linkedTicket: string;
        expiresAt: string;
        appliedAt: string;
        changes?: {
            failMode?: "open" | "closed" | undefined;
            riskThreshold?: number | undefined;
            warnThreshold?: number | undefined;
        } | undefined;
    } | undefined;
    releaseReady?: boolean | undefined;
    releaseReadyReasons?: string[] | undefined;
    ci?: {
        checks: {
            status: "pending" | "pass" | "fail" | "skip" | "stale" | "missing";
            name: string;
            required: boolean;
            conclusion?: string | undefined;
            detailsUrl?: string | undefined;
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
    storePersisted?: boolean | undefined;
}>;
export type GateEvaluation = z.infer<typeof GateEvaluation>;
export declare const GateApiResponse: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    reportUrl: z.ZodOptional<z.ZodString>;
    healthScore: z.ZodOptional<z.ZodNumber>;
    riskScore: z.ZodOptional<z.ZodNumber>;
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
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    healthScore?: number | undefined;
    riskScore?: number | undefined;
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
    reportUrl?: string | undefined;
}, {
    id?: string | undefined;
    healthScore?: number | undefined;
    riskScore?: number | undefined;
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
    environment?: string | undefined;
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
}>;
export type TrailheadContext = z.infer<typeof TrailheadContext>;
export declare const GateConfig: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["release-ready", "advisory", "risk-only"]>>;
    check_name: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    mode: "release-ready" | "advisory" | "risk-only";
    check_name: string;
}, {
    mode?: "release-ready" | "advisory" | "risk-only" | undefined;
    check_name?: string | undefined;
}>;
export type GateConfig = z.infer<typeof GateConfig>;
export declare const RepoConfig: z.ZodObject<{
    schema_version: z.ZodDefault<z.ZodNumber>;
    gate: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["release-ready", "advisory", "risk-only"]>>;
        check_name: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        mode: "release-ready" | "advisory" | "risk-only";
        check_name: string;
    }, {
        mode?: "release-ready" | "advisory" | "risk-only" | undefined;
        check_name?: string | undefined;
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
        environment?: string | undefined;
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
            risk_threshold: z.ZodOptional<z.ZodNumber>;
            required_approvals: z.ZodDefault<z.ZodNumber>;
            require_code_owner_approval: z.ZodDefault<z.ZodBoolean>;
            code_owner_reviewers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            sensitive_paths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            strict_on_unknown_provenance: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            required_approvals: number;
            require_code_owner_approval: boolean;
            code_owner_reviewers: string[];
            sensitive_paths: string[];
            strict_on_unknown_provenance: boolean;
            risk_threshold?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            risk_threshold?: number | undefined;
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
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            max_files: number;
            mode: "warn" | "block";
            max_changes: number;
            require_plan_for_agent_prs: boolean;
        }, {
            enabled?: boolean | undefined;
            max_files?: number | undefined;
            mode?: "warn" | "block" | undefined;
            max_changes?: number | undefined;
            require_plan_for_agent_prs?: boolean | undefined;
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
    }, "strip", z.ZodTypeAny, {
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
    }, {
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
            risk_threshold?: number | undefined;
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
        check_name: string;
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
        environment?: string | undefined;
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
    };
    canary?: {
        webhook_type: "vercel" | "generic";
        rollback_on_failure: boolean;
        field_map?: Record<string, string> | undefined;
    } | undefined;
}, {
    schema_version?: number | undefined;
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
    weights?: Record<string, number> | undefined;
    thresholds?: {
        warn?: number | undefined;
        risk?: number | undefined;
    } | undefined;
    gate?: {
        mode?: "release-ready" | "advisory" | "risk-only" | undefined;
        check_name?: string | undefined;
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
            risk_threshold?: number | undefined;
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
}
export interface TestRepairResult {
    testFile: string;
    failureType: string;
    strategy: string;
    success: boolean;
    diff?: string;
}
