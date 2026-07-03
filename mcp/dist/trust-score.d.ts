import { type AgentTrustMetrics, type TrustCollectorConfig } from "./agent-trust-metrics.js";
export type { AgentTrustMetrics } from "./agent-trust-metrics.js";
export type TrustProfileName = "fast-track" | "standard" | "probation";
export interface AgentTrustResult {
    score: number;
    profile: TrustProfileName;
    factors: {
        release_ready_rate: number;
        revert_rate: number;
        human_review_required_rate: number;
        remediation_efficiency: number;
        policy_violation_rate: number;
        sensitive_path_violation_rate: number;
        penalty_clean_rate?: number;
        penalty_mean_quality?: number;
    };
    thresholdDelta: number;
    autofixEnabled: boolean;
    coldStart?: {
        reason: string;
    };
}
export declare function computeAgentTrustScore(metrics: AgentTrustMetrics, options?: {
    config?: Partial<TrustCollectorConfig>;
}): AgentTrustResult | null;
export declare function strictnessFromTrust(trust: AgentTrustResult | null, riskScore: number): {
    strictness: "baseline" | "elevated" | "strict";
    reason: string;
    score?: number;
    profile?: TrustProfileName;
    factors?: AgentTrustResult["factors"];
};
