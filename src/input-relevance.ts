// ADR-011 §2 — input relevance policy (disposition engine).
//
// ADR-009's status enum (`pass|fail|skip|pending|stale|missing`) says what a check DID.
// A disposition says what that MEANS for this release decision. This module is pure:
// no octokit, no config loading, no I/O — callers resolve the policy entries for the
// matched branch pair and hand them in.

import { checkNameMatches } from "./ci-core.js";
import { matchesGlobs } from "./risk-engine.js";
import type { CiCheck, CiSummary } from "./types.js";

export type DispositionKind = "blocking" | "advisory" | "irrelevant" | "missing_blocking";

/** One row of the branch-pair relevance table, as authored in repo config. */
export interface InputRelevanceEntry {
  pattern: string;
  /** `missing_blocking` is derived, never configured — see resolveDisposition. */
  disposition: "blocking" | "advisory" | "irrelevant";
  reason?: string;
}

export interface ResolvedDisposition {
  kind: DispositionKind;
  reason?: string;
  /** `policy` = an entry matched; `default` = fell through to the required/optional rule. */
  source: "policy" | "default";
}

export interface DispositionCheckInput {
  name: string;
  status: "pass" | "fail" | "skip" | "pending" | "stale" | "missing";
  required: boolean;
}

/**
 * Reason substituted when config declares `irrelevant` without a reason. ADR-011 §2 makes the
 * reason mandatory ("reason mandatory and shown in the brief"); the config schema layer rejects
 * it too, so this is defense in depth for configs that reached us unvalidated.
 */
export const MISSING_IRRELEVANT_REASON =
  "(no reason configured — reason is mandatory for irrelevant; fix .trailhead.yml)";

/**
 * Reasons the DEFAULT source supplies, so no brief row ever renders a bare
 * `advisory / —`. ADR-011 §1 requires every input to carry a disposition *with a
 * reason*, but only policy-authored `irrelevant` entries had one — the first
 * live-brief audit found every Inputs row on a dev PR reading `advisory / —`.
 * A default disposition can always describe itself: it came from the check's
 * required/optional flag, and saying so is the whole reason.
 */
export const DEFAULT_BLOCKING_REASON = "required check";
export const DEFAULT_ADVISORY_REASON = "not required";

/**
 * ADR-009 `skip` on a check no policy entry claims. The workflow's own path
 * filter or `if:` condition already decided this check has nothing to say about
 * these files, so it is irrelevant to THIS decision — and now says so instead of
 * being narrated as a blocking input that happens not to have run.
 *
 * Outcome-neutral by construction: `skip` never counted against release
 * readiness anyway (`computeReleaseReady` counts fail/missing/stale, and the
 * blocking-set rollup in `applyInputRelevance` treats skip as passing), so
 * moving these rows out of the blocking set changes narration only.
 */
export const DEFAULT_SKIPPED_UPSTREAM_REASON =
  "skipped upstream (path filter or workflow condition)";

/**
 * Pattern matching precedence, per entry:
 *   1. exact name match                      (checkNameMatches)
 *   2. case-insensitive name match           (checkNameMatches)
 *   3. configured-value-as-prefix match      (checkNameMatches)
 *   4. glob match, case-insensitive          (matchesGlobs — lets "Deploy *" work)
 * These are a union, not a ranking: an entry matches if ANY of them matches. Ranking between
 * entries is positional only — entries are evaluated in declaration order and the FIRST
 * matching entry wins, exactly like `contexts[]` resolution in context-matcher.ts.
 */
function entryMatches(entry: InputRelevanceEntry, checkName: string): boolean {
  // A blank pattern would prefix-match every check name; treat it as matching nothing so a
  // config typo cannot silently reclassify the whole input set.
  if (entry.pattern.trim() === "") return false;
  if (checkNameMatches(entry.pattern, checkName)) return true;
  return matchesGlobs(checkName, [entry.pattern]);
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/**
 * Resolve one check to a disposition.
 *
 * - First matching entry wins. A policy-sourced disposition is never rewritten — the
 *   table is the author's stated intent for this branch pair — with one exception:
 *   ADR-009 status `skip` always resolves to `irrelevant(skipped upstream …)`,
 *   whatever the source. A blocking-configured check the workflow itself classified
 *   out (path filter, job condition) is not blocking THIS decision, and `skip`
 *   contributes zero to every blocking rollup, so this is narration-only
 *   (promotion-zero correction, trailhead#350). A policy `irrelevant` entry's own
 *   reason survives the rewrite.
 * - No match falls back to `required ? blocking : advisory` with source `default`, each
 *   carrying a self-describing reason.
 * - `missing_blocking` is DERIVED: ADR-009 status `missing` on a check that would otherwise
 *   resolve to `blocking`. It is never configurable.
 */
export function resolveDisposition(
  check: DispositionCheckInput,
  entries: InputRelevanceEntry[],
): ResolvedDisposition {
  const matched = entries.find((entry) => entryMatches(entry, check.name));

  let kind: DispositionKind;
  let reason: string | undefined;
  let source: "policy" | "default";

  if (matched) {
    kind = matched.disposition;
    reason = hasText(matched.reason) ? matched.reason : undefined;
    source = "policy";
    if (kind === "irrelevant" && reason === undefined) {
      reason = MISSING_IRRELEVANT_REASON;
    }
    if (check.status === "skip") {
      // Rendering "skip | blocking | —" contradicts itself; keep the policy's own
      // reason only when the policy already classified the check out.
      if (kind !== "irrelevant") reason = DEFAULT_SKIPPED_UPSTREAM_REASON;
      kind = "irrelevant";
    }
  } else {
    source = "default";
    if (check.status === "skip") {
      kind = "irrelevant";
      reason = DEFAULT_SKIPPED_UPSTREAM_REASON;
    } else if (check.required) {
      kind = "blocking";
      reason = DEFAULT_BLOCKING_REASON;
    } else {
      kind = "advisory";
      reason = DEFAULT_ADVISORY_REASON;
    }
  }

  if (check.status === "missing" && kind === "blocking") {
    kind = "missing_blocking";
  }

  return reason === undefined ? { kind, source } : { kind, reason, source };
}

/**
 * Resolve a whole CI input set, keyed by check name. On duplicate check names the first
 * occurrence wins, so the map is stable regardless of how many times a name appears.
 */
export function resolveDispositions(
  checks: DispositionCheckInput[],
  entries: InputRelevanceEntry[],
): Map<string, ResolvedDisposition> {
  const resolved = new Map<string, ResolvedDisposition>();
  for (const check of checks) {
    if (resolved.has(check.name)) continue;
    resolved.set(check.name, resolveDisposition(check, entries));
  }
  return resolved;
}

/** Only `blocking` and `missing_blocking` count against release readiness (ADR-011 §2 table). */
export function dispositionCountsTowardBlocking(d: ResolvedDisposition): boolean {
  return d.kind === "blocking" || d.kind === "missing_blocking";
}

/**
 * Annotate every CI input with its ADR-011 §2 disposition and re-roll the
 * summary counts against the *blocking* set rather than the `required` flag.
 *
 * With no `input_relevance` entries the default mapping is required -> blocking
 * and non-required -> advisory, so the blocking set is exactly the required set
 * and every count below reproduces `evaluateRequiredChecks` verbatim. Semantics
 * only move when a policy entry matches.
 *
 * A repo can declare blocking checks purely through `input_relevance`, with no
 * `ci.required_checks` at all — every check defaults to `required: false` in
 * that shape, so the *blocking* set this function computes is the only
 * authoritative source of "does this check gate the release", never
 * `required_checks.length`. Pure (no I/O) so callers that need to know
 * pending/blocking status ahead of a poll decision — see `waitForChecks` in
 * ci-orchestrator.ts — can call it mid-loop, not just once at the end.
 */
export function applyInputRelevance(
  summary: CiSummary,
  entries: InputRelevanceEntry[],
): CiSummary {
  const resolved = resolveDispositions(summary.checks, entries);
  const checks: CiCheck[] = summary.checks.map((check) => {
    const disposition = resolved.get(check.name);
    return disposition ? { ...check, disposition } : check;
  });
  const blocking = checks.filter(
    (check) =>
      check.disposition !== undefined &&
      dispositionCountsTowardBlocking(check.disposition),
  );

  return {
    checks,
    allRequiredPassed: blocking.every(
      (check) => check.status === "pass" || check.status === "skip",
    ),
    pendingCount: blocking.filter((check) => check.status === "pending").length,
    failedCount: blocking.filter(
      (check) =>
        check.status === "fail" || check.status === "missing" || check.status === "stale",
    ).length,
    missingCount: blocking.filter((check) => check.status === "missing").length,
  };
}
