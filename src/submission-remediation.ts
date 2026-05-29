// Submission-gate remediation (Phase B preview).
// Maps agent submission check results to RemediationFix entries so fleet
// fixtures can exercise failure modes before submission-engine.ts lands.

import { RemediationFix as RemediationFixSchema } from "./types.js";
import type { RemediationFix, RemediationSeverity } from "./types.js";

export const SUBMISSION_CHECK_CODES = [
  "artifact_integrity",
  "mock_placeholder",
  "context_freshness",
] as const;

export type SubmissionCheckCode = (typeof SUBMISSION_CHECK_CODES)[number];

export interface SubmissionCheckResult {
  code: SubmissionCheckCode;
  severity: RemediationSeverity;
  title: string;
  detail: string;
  files?: string[];
  suggested_action?: string;
  autofix_eligible?: boolean;
}

export function deriveSubmissionFixes(
  checks: SubmissionCheckResult[] | undefined,
): RemediationFix[] {
  if (!checks || checks.length === 0) return [];

  return checks.map((check) =>
    RemediationFixSchema.parse({
      code: `submission.${check.code}`,
      severity: check.severity,
      title: check.title,
      detail: check.detail,
      files: check.files ?? [],
      suggested_action: check.suggested_action,
      autofix_eligible: check.autofix_eligible ?? false,
    }),
  );
}
