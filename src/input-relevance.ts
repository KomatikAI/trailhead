// ADR-011 §2 — input relevance policy (disposition engine).
//
// ADR-009's status enum (`pass|fail|skip|pending|stale|missing`) says what a check DID.
// A disposition says what that MEANS for this release decision. This module is pure:
// no octokit, no config loading, no I/O — callers resolve the policy entries for the
// matched branch pair and hand them in.

import { checkNameMatches } from "./ci-core.js";
import { matchesGlobs } from "./risk-engine.js";

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
 * - First matching entry wins; no match falls back to `required ? blocking : advisory`
 *   with source `default`.
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
  } else {
    kind = check.required ? "blocking" : "advisory";
    source = "default";
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
