import type { RemediationFix } from "./types.js";
import type { SubmissionCheckResult } from "./submission-engine.js";
export type { SubmissionCheckResult } from "./submission-engine.js";
export { SubmissionCheckCode } from "./types.js";
export { SUBMISSION_CHECK_CODES } from "./submission-engine.js";
export declare function deriveSubmissionFixes(checks: SubmissionCheckResult[] | undefined): RemediationFix[];
