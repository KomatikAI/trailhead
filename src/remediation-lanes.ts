// Lane classification for remediation next_action routing (v4.3 agent autonomy).
// Red-lane findings require human review; yellow-lane (routine) findings loop to the agent.

import type { RemediationFix, RemediationNextAction } from "./types.js";

/** Fix codes that always require human review for agent-provenance PRs. */
export const RED_LANE_FIX_CODES = new Set([
  "submission.artifact_integrity",
  "submission.mock_placeholder",
  "policy.workflow_security",
  "policy.prompt_injection",
  "policy.ci_integrity",
  "policy.finding",
  "security.code_scanning",
  "risk.sensitive_files",
  "risk.supply_chain",
  // Over-threshold risk on an agent PR resolves via human levers only
  // (scope split or a recorded override), never an agent retry loop.
  "risk.over_threshold",
]);

/** Routine (yellow-lane) fix codes — agent should fix_and_retry. */
export const ROUTINE_FIX_CODES = new Set([
  "risk.test_coverage",
  "submission.context_freshness",
  "policy.pr_scope",
  "policy.duplicate_logic",
  "ci.failed",
  "ci.missing",
  // Severity-suffixed policy findings are the non-blocking tiers; the
  // canonical blocking `policy.finding` stays red.
  "policy.finding.warn",
  "policy.finding.advisory",
]);

export type RemediationLane = "red" | "yellow" | "unknown";

export function classifyFixLane(code: string): RemediationLane {
  if (RED_LANE_FIX_CODES.has(code)) return "red";
  if (ROUTINE_FIX_CODES.has(code)) return "yellow";
  return "unknown";
}

export function hasRedLaneFindings(fixes: RemediationFix[]): boolean {
  return fixes.some((fix) => classifyFixLane(fix.code) === "red");
}

export function isAgentProvenanceType(provenanceType: string | undefined): boolean {
  return provenanceType !== undefined && provenanceType !== "human";
}

export function computeNextAction(args: {
  releaseReady: boolean;
  blockingCount: number;
  warnCount: number;
  advisoryCount: number;
  loopRound: number;
  maxLoopRounds: number;
  redLane?: boolean;
  agentProvenance?: boolean;
  fixes: RemediationFix[];
}): RemediationNextAction {
  const redLane = args.redLane === true || hasRedLaneFindings(args.fixes);

  if (args.releaseReady) {
    return redLane ? "human_review_required" : "ready_to_merge";
  }

  if (args.agentProvenance) {
    if (redLane) return "human_review_required";
    if (args.loopRound >= args.maxLoopRounds) return "max_rounds_exceeded";
    if (args.blockingCount > 0 || args.warnCount > 0 || args.advisoryCount > 0) {
      return "fix_and_retry";
    }
    return "human_review_required";
  }

  // Human-provenance PRs — preserve legacy behavior.
  if (args.blockingCount === 0) return "human_review_required";
  if (args.loopRound >= args.maxLoopRounds) return "max_rounds_exceeded";
  return "fix_and_retry";
}
