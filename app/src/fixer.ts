/**
 * Trailhead fixer — commits allowlisted autofixes to a PR branch (Phase B2).
 * Requires GitHub App `contents: write` on the target repo.
 */

import type { AutofixPlanItem } from "./fixer-core.js";
import { buildAutofixPlan, selectAutofixCommit } from "./fixer-core.js";
import type { RemediationFix } from "../types.js";

export interface FixerCommitResult {
  committed: boolean;
  evaluationId?: string;
  autofixClass?: string;
  files?: string[];
  message?: string;
  skippedReason?: string;
}

export interface FixerOptions {
  fixes: RemediationFix[];
  evaluationId: string;
  trustAutofixEnabled?: boolean;
  /** When true, compute plan only — no git write. */
  dryRun?: boolean;
}

export function planAutofix(options: FixerOptions): {
  selected: AutofixPlanItem | null;
  blockedCount: number;
} {
  if (options.trustAutofixEnabled === false) {
    return { selected: null, blockedCount: 0 };
  }

  const plan = buildAutofixPlan(options.fixes);
  return {
    selected: selectAutofixCommit(plan),
    blockedCount: plan.blocked.length,
  };
}

/**
 * Apply at most one autofix commit for this evaluation round.
 * GitHub write path is wired in a follow-up App handler PR.
 */
export async function applyAutofixRound(
  options: FixerOptions,
): Promise<FixerCommitResult> {
  const { selected, blockedCount } = planAutofix(options);

  if (!selected) {
    return {
      committed: false,
      skippedReason:
        blockedCount > 0
          ? "All autofix candidates blocked (red lane or disallowed class)"
          : "No autofix-eligible fixes in remediation payload",
    };
  }

  if (options.dryRun) {
    return {
      committed: false,
      evaluationId: options.evaluationId,
      autofixClass: selected.autofix_class,
      files: selected.files,
      message: `[trailhead-fixer] dry-run: would apply ${selected.autofix_class}`,
    };
  }

  return {
    committed: false,
    evaluationId: options.evaluationId,
    autofixClass: selected.autofix_class,
    files: selected.files,
    skippedReason: "Fixer git write not yet enabled — dry-run only in v4.4.0",
  };
}
