import type {
  CiSummary,
  GateDecision,
  GateEvaluation,
  OverrideScope,
  PolicyOverrideAudit,
} from "./types.js";
import { checkCountsTowardBlocking } from "./release-ready.js";
import type { ReleaseReadyResult } from "./release-ready.js";

export const OVERRIDE_LABEL = "trailhead-override";
export const OVERRIDE_COMMENT_PATTERN = /^trailhead-override:\s*(.+)/im;

export interface PrComment {
  body: string;
  author?: string;
}

export interface OverrideConfig {
  enabled: boolean;
  maxPerWeek: number;
  /** ADR-011 §3 scope. Omitted is treated as "full" (pre-ADR-011 behavior). */
  scope?: OverrideScope;
}

export interface ParsedOverrideComment {
  reason: string;
  author: string;
}

export type LabelOverrideRejectionCode =
  | "missing_reason"
  | "disabled"
  | "cap_exceeded"
  | "not_needed";

export type LabelOverrideOutcome =
  | { kind: "none" }
  | { kind: "revoked"; message: string }
  | { kind: "applied"; audit: PolicyOverrideAudit }
  | { kind: "rejected"; code: LabelOverrideRejectionCode; message: string };

export function hasOverrideLabel(labels: string[]): boolean {
  return labels.some((label) => label.toLowerCase() === OVERRIDE_LABEL);
}

export function parseOverrideComment(
  comments: PrComment[],
): ParsedOverrideComment | null {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    const match = comment.body.trim().match(OVERRIDE_COMMENT_PATTERN);
    if (!match?.[1]?.trim()) continue;
    return {
      reason: match[1].trim(),
      author: comment.author?.trim() || "unknown",
    };
  }
  return null;
}

export interface OverrideReasonPartition {
  /** Risk/policy-driven reasons a risk_only override clears. */
  overridden: string[];
  /** Mechanical CI reasons that survive a risk_only override. */
  retained: string[];
}

const CI_FAILING_STATUSES = new Set<string>(["fail", "missing", "stale"]);
const CI_REQUIRED_CHECK_REASON = /^Required CI check "/;
const CI_PENDING_REASON = /required CI check\(s\) still pending$/i;

/**
 * True when a computeReleaseReady() reason came from mechanical CI rather than
 * risk/policy. ADR-011 §3: a `risk_only` override never clears these — getting
 * past a red required check stays an admin-merge.
 *
 * Structural first: a reason naming a blocking check that CiSummary reports as
 * fail/missing/stale is mechanical regardless of phrasing. The phrasing fallback
 * fails closed — a reason that still reads as a CI reason but cannot be matched
 * to a check (no CiSummary, renamed check, external CI manifest) keeps blocking.
 *
 * ADR-011 §2 composition: "blocking" is the check's disposition, not its
 * `required` flag, so an input dispositioned `irrelevant`/`advisory` never
 * produces a reason to retain, and a non-required input dispositioned `blocking`
 * survives a risk_only override.
 */
function isMechanicalCiReason(reason: string, ci?: CiSummary | null): boolean {
  const structural = ci?.checks.some(
    (check) =>
      checkCountsTowardBlocking(check) &&
      CI_FAILING_STATUSES.has(check.status) &&
      reason.includes(`"${check.name}"`),
  );
  if (structural) return true;
  if (ci && ci.pendingCount > 0 && CI_PENDING_REASON.test(reason)) return true;
  return CI_REQUIRED_CHECK_REASON.test(reason) || CI_PENDING_REASON.test(reason);
}

export function partitionOverrideReasons(
  reasons: readonly string[],
  ci?: CiSummary | null,
): OverrideReasonPartition {
  const overridden: string[] = [];
  const retained: string[] = [];
  for (const reason of reasons) {
    if (isMechanicalCiReason(reason, ci)) retained.push(reason);
    else overridden.push(reason);
  }
  return { overridden, retained };
}

export function buildLabelOverrideAudit(input: {
  parsed: ParsedOverrideComment;
  prNumber: number;
  releaseResult: ReleaseReadyResult;
  gateDecision: GateDecision;
  scope?: OverrideScope;
  ci?: CiSummary | null;
}): PolicyOverrideAudit {
  const appliedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const scope: OverrideScope = input.scope ?? "full";
  const reasons = [...input.releaseResult.reasons];

  const { overridden, retained } =
    scope === "risk_only"
      ? partitionOverrideReasons(reasons, input.ci)
      : { overridden: reasons, retained: [] as string[] };

  return {
    source: "label",
    owner: input.parsed.author,
    reason: input.parsed.reason,
    linkedTicket: `override:pr#${input.prNumber}`,
    expiresAt,
    appliedAt,
    scope,
    changes: retained.length === 0 ? { releaseReady: true } : {},
    preOverrideDecision: input.gateDecision,
    preOverrideReleaseReady: input.releaseResult.releaseReady,
    preOverrideReasons: reasons.length > 0 ? reasons : undefined,
    overriddenReasons: overridden.length > 0 ? overridden : undefined,
    retainedReasons: retained.length > 0 ? retained : undefined,
  };
}

export function formatOverrideRejectionMessage(code: LabelOverrideRejectionCode): string {
  switch (code) {
    case "missing_reason":
      return (
        "The `trailhead-override` label is present but no valid override reason was found. " +
        "Add a PR comment starting with `trailhead-override: <your reason>` " +
        "(for example: `trailhead-override: emergency hotfix for prod outage`). " +
        "Then re-run the Trailhead job, or remove and re-add the label to trigger a fresh " +
        "`pull_request` evaluation."
      );
    case "disabled":
      return (
        "The `trailhead-override` label is present but label overrides are disabled " +
        "in this repo's `.trailhead.yml` (`override.enabled: false`). Remove the label, or " +
        "enable the policy in a reviewed config change and then re-run or reapply the label."
      );
    case "cap_exceeded":
      return (
        "The `trailhead-override` label is present but this repo has reached its weekly " +
        "override cap. Remove the label, then file an issue in " +
        "[KomatikAI/trailhead](https://github.com/KomatikAI/trailhead) linking this PR and " +
        "the override pattern before applying another override."
      );
    case "not_needed":
      return (
        "The `trailhead-override` label is present but release is already ready, so no " +
        "override was applied. Remove the label to avoid leaving stale override intent on the PR."
      );
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export function resolveLabelOverride(input: {
  labels: string[];
  comments: PrComment[];
  config: OverrideConfig;
  recentOverrideCount: number | null;
  releaseResult: ReleaseReadyResult;
  gateDecision: GateDecision;
  prNumber: number;
  /** Structural CI signal used to scope a risk_only override. */
  ci?: CiSummary | null;
}): LabelOverrideOutcome {
  const parsed = parseOverrideComment(input.comments);
  if (!hasOverrideLabel(input.labels)) {
    return parsed
      ? {
          kind: "revoked",
          message:
            "A valid `trailhead-override: <reason>` comment is recorded, but the " +
            "`trailhead-override` label is absent, so no override is active. This is the " +
            "expected state after revocation. Add the label only if you intend to authorize " +
            "the recorded override; adding it triggers a fresh `pull_request:labeled` evaluation.",
        }
      : { kind: "none" };
  }

  if (!input.config.enabled) {
    return {
      kind: "rejected",
      code: "disabled",
      message: formatOverrideRejectionMessage("disabled"),
    };
  }

  if (input.releaseResult.releaseReady) {
    return {
      kind: "rejected",
      code: "not_needed",
      message: formatOverrideRejectionMessage("not_needed"),
    };
  }

  if (!parsed) {
    return {
      kind: "rejected",
      code: "missing_reason",
      message: formatOverrideRejectionMessage("missing_reason"),
    };
  }

  if (
    input.recentOverrideCount !== null &&
    input.recentOverrideCount >= input.config.maxPerWeek
  ) {
    return {
      kind: "rejected",
      code: "cap_exceeded",
      message: formatOverrideRejectionMessage("cap_exceeded"),
    };
  }

  return {
    kind: "applied",
    audit: buildLabelOverrideAudit({
      parsed,
      prNumber: input.prNumber,
      releaseResult: input.releaseResult,
      gateDecision: input.gateDecision,
      scope: input.config.scope,
      ci: input.ci,
    }),
  };
}

export function applyLabelOverrideToEvaluation(
  evaluation: GateEvaluation,
  audit: PolicyOverrideAudit,
): GateEvaluation {
  if ((audit.scope ?? "full") !== "risk_only") {
    return {
      ...evaluation,
      releaseReady: true,
      releaseReadyReasons: undefined,
      policyOverride: audit,
    };
  }

  // Re-partition against the evaluation's own CiSummary: it is the authoritative
  // structural signal, and the audit may have been built without one.
  const reasons = evaluation.releaseReadyReasons ?? audit.preOverrideReasons ?? [];
  const { overridden, retained } = partitionOverrideReasons(reasons, evaluation.ci);
  const releaseReady = retained.length === 0;
  const { releaseReady: _clearedFlag, ...changesWithoutReleaseReady } = audit.changes;

  return {
    ...evaluation,
    releaseReady,
    releaseReadyReasons: retained.length > 0 ? retained : undefined,
    policyOverride: {
      ...audit,
      changes: releaseReady
        ? { ...audit.changes, releaseReady: true }
        : changesWithoutReleaseReady,
      overriddenReasons: overridden.length > 0 ? overridden : undefined,
      retainedReasons: retained.length > 0 ? retained : undefined,
    },
  };
}
