import type { GateDecision, GateEvaluation, PolicyOverrideAudit } from "./types.js";
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

export function buildLabelOverrideAudit(input: {
  parsed: ParsedOverrideComment;
  prNumber: number;
  releaseResult: ReleaseReadyResult;
  gateDecision: GateDecision;
}): PolicyOverrideAudit {
  const appliedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    source: "label",
    owner: input.parsed.author,
    reason: input.parsed.reason,
    linkedTicket: `override:pr#${input.prNumber}`,
    expiresAt,
    appliedAt,
    changes: { releaseReady: true },
    preOverrideDecision: input.gateDecision,
    preOverrideReleaseReady: input.releaseResult.releaseReady,
    preOverrideReasons:
      input.releaseResult.reasons.length > 0
        ? [...input.releaseResult.reasons]
        : undefined,
  };
}

export function formatOverrideRejectionMessage(code: LabelOverrideRejectionCode): string {
  switch (code) {
    case "missing_reason":
      return (
        "The `trailhead-override` label is present but no valid override reason was found. " +
        "Add a PR comment starting with `trailhead-override: <your reason>` " +
        "(for example: `trailhead-override: emergency hotfix for prod outage`). " +
        "The gate will re-evaluate on the next run after the comment is posted."
      );
    case "disabled":
      return (
        "The `trailhead-override` label is present but label overrides are disabled " +
        "in this repo's `.trailhead.yml` (`override.enabled: false`)."
      );
    case "cap_exceeded":
      return (
        "The `trailhead-override` label is present but this repo has reached its weekly " +
        "override cap. File an issue in [KomatikAI/trailhead](https://github.com/KomatikAI/trailhead) " +
        "linking this PR and the override pattern before applying another override."
      );
    case "not_needed":
      return "The `trailhead-override` label is present but release is already ready — no override applied.";
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
}): LabelOverrideOutcome {
  if (!hasOverrideLabel(input.labels)) {
    return { kind: "none" };
  }

  if (!input.config.enabled) {
    return {
      kind: "rejected",
      code: "disabled",
      message: formatOverrideRejectionMessage("disabled"),
    };
  }

  if (input.releaseResult.releaseReady) {
    return { kind: "none" };
  }

  const parsed = parseOverrideComment(input.comments);
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
    }),
  };
}

export function applyLabelOverrideToEvaluation(
  evaluation: GateEvaluation,
  audit: PolicyOverrideAudit,
): GateEvaluation {
  return {
    ...evaluation,
    releaseReady: true,
    releaseReadyReasons: undefined,
    policyOverride: audit,
  };
}
