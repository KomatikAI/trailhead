/**
 * Trailhead fixer — commits allowlisted autofixes to a PR branch (Phase B2).
 * Requires GitHub App `contents: write` on the target repo.
 *
 * The actual git write lives in the shared autofix-executor (ADR-010); this is
 * the App-side entry point that supplies a GitWriter + the PR's files/branch.
 */

import type { AutofixPlanItem } from "./fixer-core.js";
import { buildAutofixPlan, selectAutofixCommit } from "./fixer-core.js";
import type { RemediationFix } from "./types.js";
import type { SubmissionFileInfo } from "./submission-checks/types.js";
import {
  executeAutofixRound,
  type AutofixBuilderRegistry,
  type AutofixBuildContext,
  type GitWriter,
} from "./autofix-executor.js";
import { DEFAULT_AUTOFIX_BUILDERS } from "./autofix-builders.js";

export interface FixerCommitResult {
  committed: boolean;
  evaluationId?: string;
  autofixClass?: string;
  fixCode?: string;
  files?: string[];
  message?: string;
  commitSha?: string;
  skippedReason?: string;
}

export interface FixerOptions {
  fixes: RemediationFix[];
  evaluationId: string;
  trustAutofixEnabled?: boolean;
  /** When true, compute plan + edits only — no git write. */
  dryRun?: boolean;
  /** The PR's changed files (with content) — required to build edit content. */
  files?: SubmissionFileInfo[];
  /** Git writer + target branch — when present, the round actually commits. */
  writer?: GitWriter;
  branch?: string;
  /** Override the content-builder registry (defaults to DEFAULT_AUTOFIX_BUILDERS). */
  builders?: AutofixBuilderRegistry;
  buildContext?: AutofixBuildContext;
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
 * Apply at most one autofix commit for this evaluation round. When a GitWriter +
 * branch + files are supplied, the shared executor builds the edit content and
 * commits it; otherwise it falls back to plan-only (dry-run semantics).
 */
export async function applyAutofixRound(
  options: FixerOptions,
): Promise<FixerCommitResult> {
  if (options.writer && options.branch && options.files) {
    const result = await executeAutofixRound({
      fixes: options.fixes,
      files: options.files,
      builders: options.builders ?? DEFAULT_AUTOFIX_BUILDERS,
      writer: options.writer,
      branch: options.branch,
      evaluationId: options.evaluationId,
      trustAutofixEnabled: options.trustAutofixEnabled,
      dryRun: options.dryRun,
      buildContext: options.buildContext,
    });
    return {
      committed: result.committed,
      evaluationId: result.evaluationId,
      autofixClass: result.autofixClass,
      fixCode: result.fixCode,
      files: result.files,
      message: result.message,
      commitSha: result.commitSha,
      skippedReason: result.skippedReason,
    };
  }

  // No git writer configured → plan-only.
  const { selected, blockedCount } = planAutofix(options);
  if (!selected) {
    return {
      committed: false,
      evaluationId: options.evaluationId,
      skippedReason:
        blockedCount > 0
          ? "All autofix candidates blocked (red lane or disallowed class)"
          : "No autofix-eligible fixes in remediation payload",
    };
  }

  return {
    committed: false,
    evaluationId: options.evaluationId,
    autofixClass: selected.autofix_class,
    files: selected.files,
    message: `[trailhead-fixer] plan-only: would apply ${selected.autofix_class} (no git writer configured)`,
  };
}
