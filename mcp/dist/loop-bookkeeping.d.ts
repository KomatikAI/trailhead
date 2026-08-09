import type { GateDecision, Remediation } from "./types.js";
/**
 * What the store returns about the previous evaluation of a PR. `id`/`remediation`
 * drive loop bookkeeping; the rest is ADR-011 §1 delta material and is present only
 * when the backend actually returned those columns — every consumer must treat the
 * optional fields as "unknown", never as "unchanged".
 */
export interface PreviousEvaluationSnapshot {
    id: string;
    remediation?: Remediation;
    riskScore?: number;
    gateDecision?: GateDecision;
    releaseReady?: boolean;
    /** Ids of the previous evaluation's enumerated findings (ADR-011 §1). */
    findingIds?: string[];
}
export declare function resolveLoopRound(previous: PreviousEvaluationSnapshot | null | undefined): number;
export declare function parseAgentIdFromHeadRef(headRef: string | undefined): string | null;
export declare function parsePreviousEvaluationRow(row: unknown): PreviousEvaluationSnapshot | null;
export declare function pickLatestPreviousEvaluation(rows: unknown[], excludeEvaluationId?: string): PreviousEvaluationSnapshot | null;
