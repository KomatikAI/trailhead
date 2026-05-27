import type { CiCheck, CiCheckStatusEnum, CiSummary, ContextCiConfig } from "./types.js";
import type { CiManifest } from "./ci-manifest.js";
export declare const DEFAULT_SELF_CHECK_NAMES: string[];
export interface RawCheckRun {
    name: string;
    status: string;
    conclusion: string | null;
    html_url?: string | null;
    details_url?: string | null;
}
/**
 * Map GitHub check conclusion/status to Trailhead CI status (ADR-009).
 */
export declare function classifyCheck(status: string, conclusion: string | null): CiCheckStatusEnum;
export declare function checkNameMatches(configured: string, actual: string): boolean;
export declare function normalizeCheckRuns(runs: RawCheckRun[], excludeCheckNames?: string[]): CiCheck[];
export declare function evaluateRequiredChecks(allChecks: CiCheck[], ciConfig: ContextCiConfig, manifest?: CiManifest | null): CiSummary;
export declare function formatCiStatusIcon(status: CiCheckStatusEnum): string;
