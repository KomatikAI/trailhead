import { z } from "zod";
import type { TrustFeedbackCounts } from "./agent-trust-metrics.js";
export declare const AGENT_TRUST_FEEDBACK_SCHEMA: "trailhead.feedback.v1";
export declare const TrustFeedbackOutcome: z.ZodEnum<["ci_pass", "ci_fail", "revert", "rollback", "rounds_to_green", "human_review"]>;
export type TrustFeedbackOutcome = z.infer<typeof TrustFeedbackOutcome>;
export declare const TrustFeedbackEventSchema: z.ZodObject<{
    schema: z.ZodOptional<z.ZodLiteral<"trailhead.feedback.v1">>;
    submission_id: z.ZodOptional<z.ZodString>;
    pr_number: z.ZodOptional<z.ZodNumber>;
    evaluation_id: z.ZodOptional<z.ZodString>;
    agent_id: z.ZodOptional<z.ZodString>;
    head_ref: z.ZodOptional<z.ZodString>;
    project_slug: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<["ci_pass", "ci_fail", "revert", "rollback", "rounds_to_green", "human_review"]>;
    remediation_rounds: z.ZodOptional<z.ZodNumber>;
    observed_at: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    outcome: "ci_pass" | "ci_fail" | "revert" | "rollback" | "rounds_to_green" | "human_review";
    observed_at: string;
    schema?: "trailhead.feedback.v1" | undefined;
    agent_id?: string | undefined;
    submission_id?: string | undefined;
    pr_number?: number | undefined;
    evaluation_id?: string | undefined;
    head_ref?: string | undefined;
    project_slug?: string | undefined;
    remediation_rounds?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    outcome: "ci_pass" | "ci_fail" | "revert" | "rollback" | "rounds_to_green" | "human_review";
    observed_at: string;
    schema?: "trailhead.feedback.v1" | undefined;
    agent_id?: string | undefined;
    submission_id?: string | undefined;
    pr_number?: number | undefined;
    evaluation_id?: string | undefined;
    head_ref?: string | undefined;
    project_slug?: string | undefined;
    remediation_rounds?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type TrustFeedbackEvent = z.infer<typeof TrustFeedbackEventSchema>;
export declare const TrustFeedbackBatchSchema: z.ZodObject<{
    schema: z.ZodLiteral<"trailhead.feedback.v1">;
    collected_at: z.ZodString;
    events: z.ZodArray<z.ZodObject<{
        schema: z.ZodOptional<z.ZodLiteral<"trailhead.feedback.v1">>;
        submission_id: z.ZodOptional<z.ZodString>;
        pr_number: z.ZodOptional<z.ZodNumber>;
        evaluation_id: z.ZodOptional<z.ZodString>;
        agent_id: z.ZodOptional<z.ZodString>;
        head_ref: z.ZodOptional<z.ZodString>;
        project_slug: z.ZodOptional<z.ZodString>;
        outcome: z.ZodEnum<["ci_pass", "ci_fail", "revert", "rollback", "rounds_to_green", "human_review"]>;
        remediation_rounds: z.ZodOptional<z.ZodNumber>;
        observed_at: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        outcome: "ci_pass" | "ci_fail" | "revert" | "rollback" | "rounds_to_green" | "human_review";
        observed_at: string;
        schema?: "trailhead.feedback.v1" | undefined;
        agent_id?: string | undefined;
        submission_id?: string | undefined;
        pr_number?: number | undefined;
        evaluation_id?: string | undefined;
        head_ref?: string | undefined;
        project_slug?: string | undefined;
        remediation_rounds?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        outcome: "ci_pass" | "ci_fail" | "revert" | "rollback" | "rounds_to_green" | "human_review";
        observed_at: string;
        schema?: "trailhead.feedback.v1" | undefined;
        agent_id?: string | undefined;
        submission_id?: string | undefined;
        pr_number?: number | undefined;
        evaluation_id?: string | undefined;
        head_ref?: string | undefined;
        project_slug?: string | undefined;
        remediation_rounds?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    unattributed: z.ZodOptional<z.ZodObject<{
        ci_failures: z.ZodOptional<z.ZodNumber>;
        reverts: z.ZodOptional<z.ZodNumber>;
        human_review: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        reverts?: number | undefined;
        human_review?: number | undefined;
        ci_failures?: number | undefined;
    }, {
        reverts?: number | undefined;
        human_review?: number | undefined;
        ci_failures?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    schema: "trailhead.feedback.v1";
    collected_at: string;
    events: {
        outcome: "ci_pass" | "ci_fail" | "revert" | "rollback" | "rounds_to_green" | "human_review";
        observed_at: string;
        schema?: "trailhead.feedback.v1" | undefined;
        agent_id?: string | undefined;
        submission_id?: string | undefined;
        pr_number?: number | undefined;
        evaluation_id?: string | undefined;
        head_ref?: string | undefined;
        project_slug?: string | undefined;
        remediation_rounds?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
    unattributed?: {
        reverts?: number | undefined;
        human_review?: number | undefined;
        ci_failures?: number | undefined;
    } | undefined;
}, {
    schema: "trailhead.feedback.v1";
    collected_at: string;
    events: {
        outcome: "ci_pass" | "ci_fail" | "revert" | "rollback" | "rounds_to_green" | "human_review";
        observed_at: string;
        schema?: "trailhead.feedback.v1" | undefined;
        agent_id?: string | undefined;
        submission_id?: string | undefined;
        pr_number?: number | undefined;
        evaluation_id?: string | undefined;
        head_ref?: string | undefined;
        project_slug?: string | undefined;
        remediation_rounds?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
    unattributed?: {
        reverts?: number | undefined;
        human_review?: number | undefined;
        ci_failures?: number | undefined;
    } | undefined;
}>;
export type TrustFeedbackBatch = z.infer<typeof TrustFeedbackBatchSchema>;
export interface TrustFeedbackRollup {
    feedback: TrustFeedbackCounts;
    remediationRoundsToReady: number[];
    attributed: number;
    unattributed: number;
}
export declare function resolveAgentIdFromFeedbackEvent(event: TrustFeedbackEvent): string | null;
export declare function parseTrustFeedbackEvent(raw: unknown): TrustFeedbackEvent | null;
export declare function parseTrustFeedbackBatch(raw: string | unknown): TrustFeedbackBatch | null;
/** Map feedback events for a single agent into AgentTrustMetrics partial fields. */
export declare function rollupFeedbackForAgent(events: TrustFeedbackEvent[], agentId: string): TrustFeedbackRollup;
export declare function mergeFeedbackIntoMetrics<T extends {
    revertCount: number;
    humanReviewRequiredCount: number;
    policyViolationCount: number;
    remediationRoundsToReady: number[];
    feedback?: TrustFeedbackCounts;
}>(metrics: T, rollup: TrustFeedbackRollup): T;
