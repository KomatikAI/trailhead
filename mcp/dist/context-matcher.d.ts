import type { TrailheadContext, MatchedContext } from "./types.js";
export interface PrMatchContext {
    baseRef: string;
    headRef: string;
    labels: string[];
}
/**
 * Returns the first matching context (declaration order wins).
 */
export declare function matchContext(contexts: TrailheadContext[], pr: PrMatchContext): {
    context: TrailheadContext;
    matched: MatchedContext;
} | null;
export declare function resolveGateMode(repoGateMode: string | undefined, schemaVersion: number, inputGateMode?: string): "release-ready" | "advisory" | "risk-only";
