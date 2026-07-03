import { z } from "zod";
export const GateDecision = z.enum(["allow", "warn", "block"]);
export const EvaluationPayload = z
    .object({
    id: z.string().min(1),
    repoId: z.string().min(1),
    commitSha: z.string().min(1),
    prNumber: z.number().int().optional(),
    healthScore: z.number().min(0).max(100),
    riskScore: z.number().min(0).max(100),
    sizeScore: z.number().min(0).max(100).optional(),
    gateDecision: GateDecision,
    healthChecks: z.array(z.record(z.unknown())).default([]),
    riskFactors: z.array(z.record(z.unknown())).default([]),
    sizeFactors: z.array(z.record(z.unknown())).optional(),
    files: z.array(z.string()).optional(),
    evaluationMs: z.number(),
    reportUrl: z.string().url().optional(),
    environment: z.string().optional(),
    releaseReady: z.boolean().optional(),
    releaseReadyReasons: z.array(z.string()).optional(),
    gateMode: z.string().optional(),
    ci: z.record(z.unknown()).optional(),
    context: z.record(z.unknown()).optional(),
})
    .passthrough();
export const DeployEventPayload = z.object({
    deploymentId: z.string().min(1),
    environment: z.string().min(1),
    status: z.enum(["success", "failure", "cancelled"]),
    durationMs: z.number().optional(),
    url: z.string().optional(),
    timestamp: z.string(),
    source: z.enum(["vercel", "generic"]).optional(),
    repoId: z.string().optional(),
    commitSha: z.string().optional(),
});
export const FeedbackDisposition = z.enum([
    "false_positive",
    "true_positive",
    "dismissed",
]);
export const FeedbackPayload = z.object({
    detector: z.string().min(1),
    disposition: FeedbackDisposition,
    repo: z.string().optional(),
    reason: z.string().optional(),
    evaluationId: z.string().optional(),
});
export const DigestSubscribePayload = z.object({
    enabled: z.boolean(),
    channel: z.enum(["slack", "email", "webhook"]),
    destination: z.string().min(3),
    fpThreshold: z.number().min(0).max(100).default(15),
});
export const OrgSettingsPatch = z.object({
    plan: z.enum(["free", "pro", "team"]).optional(),
    seats: z.number().int().min(1).optional(),
    sso: z
        .object({
        enabled: z.boolean(),
        provider: z.enum(["saml", "oidc"]),
        issuerUrl: z.string().url().optional(),
        clientId: z.string().optional(),
    })
        .optional(),
});
