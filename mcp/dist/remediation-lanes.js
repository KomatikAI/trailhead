// Lane classification for remediation next_action routing (v4.3 agent autonomy).
// Red-lane findings require human review; yellow-lane (routine) findings loop to the agent.
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
]);
/** Routine (yellow-lane) fix codes — agent should fix_and_retry. */
export const ROUTINE_FIX_CODES = new Set([
    "risk.test_coverage",
    "submission.context_freshness",
    "policy.pr_scope",
    "policy.duplicate_logic",
    "ci.failed",
    "ci.missing",
]);
export function classifyFixLane(code) {
    if (RED_LANE_FIX_CODES.has(code))
        return "red";
    if (ROUTINE_FIX_CODES.has(code))
        return "yellow";
    return "unknown";
}
export function hasRedLaneFindings(fixes) {
    return fixes.some((fix) => classifyFixLane(fix.code) === "red");
}
export function isAgentProvenanceType(provenanceType) {
    return provenanceType !== undefined && provenanceType !== "human";
}
export function computeNextAction(args) {
    const redLane = args.redLane === true || hasRedLaneFindings(args.fixes);
    if (args.releaseReady) {
        return redLane ? "human_review_required" : "ready_to_merge";
    }
    if (args.agentProvenance) {
        if (redLane)
            return "human_review_required";
        if (args.loopRound >= args.maxLoopRounds)
            return "max_rounds_exceeded";
        if (args.blockingCount > 0 || args.warnCount > 0 || args.advisoryCount > 0) {
            return "fix_and_retry";
        }
        return "human_review_required";
    }
    // Human-provenance PRs — preserve legacy behavior.
    if (args.blockingCount === 0)
        return "human_review_required";
    if (args.loopRound >= args.maxLoopRounds)
        return "max_rounds_exceeded";
    return "fix_and_retry";
}
