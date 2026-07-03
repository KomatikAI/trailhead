import type { GateEvaluation } from "./types.js";
export type PreviousEvaluationSnapshot = Pick<GateEvaluation, "id" | "remediation">;
export declare function resolveLoopRound(previous: PreviousEvaluationSnapshot | null | undefined): number;
export declare function parseAgentIdFromHeadRef(headRef: string | undefined): string | null;
export declare function parsePreviousEvaluationRow(row: unknown): PreviousEvaluationSnapshot | null;
export declare function pickLatestPreviousEvaluation(rows: unknown[], excludeEvaluationId?: string): PreviousEvaluationSnapshot | null;
