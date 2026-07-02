import type { DetectorFeedbackRecord } from "./feedback-core.js";
import type { StoredEvaluation } from "./types.js";
export interface TuningDigestWindow {
    start: string;
    end: string;
    days: number;
}
export interface TuningDigestDetectorRow {
    code: string;
    blocked: number;
    warned: number;
    fixed_after_remediation: number;
    fp_signals: number;
    fp_rate: number;
    status: "ok" | "auto_downgraded" | "noisy";
    downgraded_at?: string;
}
export interface TuningDigestAgentRow {
    agent_id: string;
    prs: number;
    ready: number;
    blocked: number;
    abandoned: number;
    median_rounds_to_ready: number | null;
    sensitive_path_violations: number;
    trust_signal: "converging" | "flailing" | "quiet";
}
export interface TuningDigestPayload {
    schema: "trailhead.tuning-digest.v1";
    repo: string;
    window: TuningDigestWindow;
    totals: {
        evaluations: number;
        block: number;
        warn: number;
        allow: number;
        overrides: number;
        agent_prs: number;
    };
    detectors: TuningDigestDetectorRow[];
    agents: TuningDigestAgentRow[];
    overrides: Array<{
        pr_url?: string;
        author?: string;
        reason?: string;
        pre_decision?: string;
    }>;
    auto_downgrades_last_7d: Array<{
        detector: string;
        downgraded_at: string;
        fp_rate_at_trigger: number;
        tuning_issue?: string;
    }>;
}
export interface AgentRecentEvaluationsPayload {
    agent_id: string;
    window_days: number;
    evaluations: number;
    decisions: {
        allow: number;
        warn: number;
        block: number;
    };
    ready_without_human: number;
    median_rounds_to_ready: number | null;
    p95_rounds_to_ready: number | null;
    sensitive_path_violations: number;
    top_detectors: Array<{
        code: string;
        count: number;
    }>;
    trust_signal_v1: "converging" | "flailing" | "quiet";
}
export interface DetectorDowngradeRecord {
    detectorCode: string;
    downgradedAt: string;
    fpRateAtTrigger: number;
    tuningIssueUrl?: string;
    revertedAt?: string;
    revertedBy?: string;
}
export interface AutoDowngradeCandidate {
    detector: string;
    fpRate: number;
    emissions: number;
    fpSignals: number;
    alreadyDowngraded: boolean;
}
export declare function resolveAgentProvenanceId(row: StoredEvaluation): string | null;
export declare function extractDetectorCodes(row: StoredEvaluation): string[];
export declare function buildTuningDigestV1(args: {
    repoId: string;
    evaluations: StoredEvaluation[];
    feedback: DetectorFeedbackRecord[];
    downgrades: DetectorDowngradeRecord[];
    days?: number;
    now?: Date;
    fpThreshold?: number;
}): TuningDigestPayload;
export declare function buildAgentRecentEvaluations(args: {
    agentId: string;
    evaluations: StoredEvaluation[];
    days?: number;
    now?: Date;
    repoId?: string;
}): AgentRecentEvaluationsPayload;
export declare function evaluateAutoDowngradeCandidates(args: {
    evaluations: StoredEvaluation[];
    feedback: DetectorFeedbackRecord[];
    downgrades: DetectorDowngradeRecord[];
    days?: number;
    now?: Date;
    fpThreshold?: number;
    minEmissions?: number;
}): AutoDowngradeCandidate[];
