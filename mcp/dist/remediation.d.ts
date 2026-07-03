import type { SubmissionCheckResult } from "./submission-remediation.js";
export { RED_LANE_FIX_CODES, ROUTINE_FIX_CODES, classifyFixLane, hasRedLaneFindings, isAgentProvenanceType, computeNextAction, } from "./remediation-lanes.js";
import type { AgentBriefMode, GateEvaluation, PrProvenance, Remediation } from "./types.js";
export interface BuildRemediationInput {
    evaluation: Pick<GateEvaluation, "id" | "riskFactors" | "ci" | "releaseReady" | "releaseReadyReasons" | "policyFindings" | "gateDecision">;
    previousEvaluation?: Pick<GateEvaluation, "id" | "remediation"> | null;
    loopRound?: number;
    maxLoopRounds?: number;
    agentProvenance?: boolean;
    submissionChecks?: SubmissionCheckResult[];
}
export declare function buildRemediation(input: BuildRemediationInput): Remediation;
export declare const SUGGESTED_COMMANDS: {
    test: string;
    lint: string;
    format: string;
};
export declare function resolveAgentBriefMode(input: {
    actionSetting?: AgentBriefMode;
    repoSetting?: AgentBriefMode;
    provenanceType?: PrProvenance["type"];
}): AgentBriefMode;
export declare function formatAgentBrief(remediation: Remediation, mode: AgentBriefMode): string;
