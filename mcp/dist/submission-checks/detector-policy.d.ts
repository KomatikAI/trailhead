import type { RemediationSeverity, SubmissionCheckCode, SubmissionConfig } from "../types.js";
import { type RenamePatternEntry } from "./policy-defaults.js";
export type DetectorPolicyEntry = {
    enabled?: boolean;
    severity?: RemediationSeverity;
    fileGlobs?: string[];
    pathIgnore?: string[];
};
export type DetectorPolicyMap = Partial<Record<SubmissionCheckCode, DetectorPolicyEntry>>;
export declare function resolveDetectorPolicy(submission?: Partial<SubmissionConfig>): {
    policy: DetectorPolicyMap;
    warnings: string[];
};
export declare function buildRenamePatterns(submission?: Partial<SubmissionConfig>, options?: {
    includeKomatikDefaults?: boolean;
}): RenamePatternEntry[];
export declare function buildSlugOnlyPatterns(submission?: Partial<SubmissionConfig>): RegExp[];
export declare function artifactFileGlobs(policy: DetectorPolicyMap): string[];
export declare function applyDetectorPolicy(code: SubmissionCheckCode, check: import("../types.js").SubmissionCheckResult | null, policy: DetectorPolicyMap): import("../types.js").SubmissionCheckResult | null;
export declare function getSubmissionConfigWarnings(submission?: Partial<SubmissionConfig>): string[];
