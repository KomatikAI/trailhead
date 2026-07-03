import type { RemediationFix, RemediationNextAction } from "./types.js";
/** Fix codes that always require human review for agent-provenance PRs. */
export declare const RED_LANE_FIX_CODES: Set<string>;
/** Routine (yellow-lane) fix codes — agent should fix_and_retry. */
export declare const ROUTINE_FIX_CODES: Set<string>;
export type RemediationLane = "red" | "yellow" | "unknown";
export declare function classifyFixLane(code: string): RemediationLane;
export declare function hasRedLaneFindings(fixes: RemediationFix[]): boolean;
export declare function isAgentProvenanceType(provenanceType: string | undefined): boolean;
export declare function computeNextAction(args: {
    releaseReady: boolean;
    blockingCount: number;
    warnCount: number;
    advisoryCount: number;
    loopRound: number;
    maxLoopRounds: number;
    redLane?: boolean;
    agentProvenance?: boolean;
    fixes: RemediationFix[];
}): RemediationNextAction;
