// Post-merge outcome feedback contract (epic #252 / issue #257).
import { z } from "zod";
export const AGENT_TRUST_FEEDBACK_SCHEMA = "trailhead.feedback.v1";
export const TrustFeedbackOutcome = z.enum([
    "ci_pass",
    "ci_fail",
    "revert",
    "rollback",
    "rounds_to_green",
    "human_review",
]);
export const TrustFeedbackEventSchema = z.object({
    schema: z.literal(AGENT_TRUST_FEEDBACK_SCHEMA).optional(),
    submission_id: z.string().optional(),
    pr_number: z.number().int().positive().optional(),
    evaluation_id: z.string().optional(),
    agent_id: z.string().optional(),
    head_ref: z.string().optional(),
    project_slug: z.string().optional(),
    outcome: TrustFeedbackOutcome,
    remediation_rounds: z.number().int().min(0).optional(),
    observed_at: z.string(),
    metadata: z.record(z.unknown()).optional(),
});
export const TrustFeedbackBatchSchema = z.object({
    schema: z.literal(AGENT_TRUST_FEEDBACK_SCHEMA),
    collected_at: z.string(),
    events: z.array(TrustFeedbackEventSchema),
    unattributed: z
        .object({
        ci_failures: z.number().int().min(0).optional(),
        reverts: z.number().int().min(0).optional(),
        human_review: z.number().int().min(0).optional(),
    })
        .optional(),
});
const AGENT_HEAD_REF = /^agent\/([a-z][a-z0-9-]*)\//;
export function resolveAgentIdFromFeedbackEvent(event) {
    if (event.agent_id?.trim())
        return event.agent_id.trim();
    const headRef = event.head_ref?.trim();
    if (headRef) {
        const match = headRef.match(AGENT_HEAD_REF);
        if (match)
            return match[1];
    }
    const metaRef = typeof event.metadata?.head_ref === "string"
        ? event.metadata.head_ref
        : typeof event.metadata?.ref === "string"
            ? event.metadata.ref.replace(/^refs\/heads\//, "")
            : null;
    if (metaRef) {
        const match = metaRef.match(AGENT_HEAD_REF);
        if (match)
            return match[1];
    }
    return null;
}
export function parseTrustFeedbackEvent(raw) {
    const parsed = TrustFeedbackEventSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}
export function parseTrustFeedbackBatch(raw) {
    try {
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        const parsed = TrustFeedbackBatchSchema.safeParse(value);
        return parsed.success ? parsed.data : null;
    }
    catch {
        return null;
    }
}
/** Map feedback events for a single agent into AgentTrustMetrics partial fields. */
export function rollupFeedbackForAgent(events, agentId) {
    const feedback = {
        ciFailures: 0,
        reverts: 0,
        humanReview: 0,
    };
    const remediationRoundsToReady = [];
    let attributed = 0;
    let unattributed = 0;
    for (const event of events) {
        const resolved = resolveAgentIdFromFeedbackEvent(event);
        if (resolved !== agentId) {
            if (resolved === null && !event.agent_id)
                unattributed += 1;
            continue;
        }
        attributed += 1;
        switch (event.outcome) {
            case "ci_fail":
                feedback.ciFailures = (feedback.ciFailures ?? 0) + 1;
                break;
            case "revert":
            case "rollback":
                feedback.reverts = (feedback.reverts ?? 0) + 1;
                break;
            case "human_review":
                feedback.humanReview = (feedback.humanReview ?? 0) + 1;
                break;
            case "rounds_to_green":
                if (typeof event.remediation_rounds === "number") {
                    remediationRoundsToReady.push(event.remediation_rounds);
                }
                break;
            case "ci_pass":
                break;
        }
    }
    return {
        feedback,
        remediationRoundsToReady,
        attributed,
        unattributed,
    };
}
export function mergeFeedbackIntoMetrics(metrics, rollup) {
    const fb = rollup.feedback;
    return {
        ...metrics,
        revertCount: metrics.revertCount + (fb.reverts ?? 0),
        humanReviewRequiredCount: metrics.humanReviewRequiredCount + (fb.humanReview ?? 0) + (fb.ciFailures ?? 0),
        policyViolationCount: metrics.policyViolationCount + (fb.ciFailures ?? 0),
        remediationRoundsToReady: [
            ...metrics.remediationRoundsToReady,
            ...rollup.remediationRoundsToReady,
        ],
        feedback: {
            ciFailures: (metrics.feedback?.ciFailures ?? 0) + (fb.ciFailures ?? 0),
            reverts: (metrics.feedback?.reverts ?? 0) + (fb.reverts ?? 0),
            humanReview: (metrics.feedback?.humanReview ?? 0) + (fb.humanReview ?? 0),
        },
    };
}
