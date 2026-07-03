import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext, SubmissionFileInfo } from "./types.js";
export type RefKind = "local" | "owned" | "contract";
export interface ContractRefFinding {
    file: string;
    field: string;
    ref: string;
    name: string;
    kind: RefKind;
}
export declare function isCatalogFile(file: SubmissionFileInfo): boolean;
/**
 * Core analysis shared by the detector and the self-heal lane: parse the PR's
 * catalog files, build the resolution universe, and return every reference that
 * doesn't resolve. Returns null when there are no catalog files to analyze.
 */
export declare function analyzeCatalogRefs(files: SubmissionFileInfo[], knownEntities?: Set<string>): {
    findings: ContractRefFinding[];
    hasOrgIndex: boolean;
} | null;
export declare function detectContractIntegrity(ctx: SubmissionCheckContext): SubmissionCheckResult | null;
