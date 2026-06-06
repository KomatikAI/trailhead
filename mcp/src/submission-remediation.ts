// Submission-gate remediation mapping (Phase B).
// Maps submission-engine check results to RemediationFix entries.

import { RemediationFix as RemediationFixSchema } from "./types.js";
import type { RemediationFix } from "./types.js";
import type { SubmissionCheckResult } from "./submission-engine.js";

export type { SubmissionCheckResult } from "./submission-engine.js";
export { SubmissionCheckCode, SUBMISSION_CHECK_CODES } from "./submission-engine.js";

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
      autofix_class:
        check.autofix_eligible &&
        (check.code === "context_freshness" || check.code === "contract_integrity")
          ? "doc-update"
          : undefined,
    }),
  );
}
