import { z } from "zod";
import type { PlanTier } from "./billing.js";
export declare const GateDecision: z.ZodEnum<["allow", "warn", "block"]>;
export declare const EvaluationPayload: z.ZodObject<{
    id: z.ZodString;
    repoId: z.ZodString;
    commitSha: z.ZodString;
    prNumber: z.ZodOptional<z.ZodNumber>;
    healthScore: z.ZodNumber;
    riskScore: z.ZodNumber;
    sizeScore: z.ZodOptional<z.ZodNumber>;
    gateDecision: z.ZodEnum<["allow", "warn", "block"]>;
    healthChecks: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    riskFactors: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    sizeFactors: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    evaluationMs: z.ZodNumber;
    reportUrl: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodString>;
    releaseReady: z.ZodOptional<z.ZodBoolean>;
    releaseReadyReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    gateMode: z.ZodOptional<z.ZodString>;
    ci: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
    repoId: z.ZodString;
    commitSha: z.ZodString;
    prNumber: z.ZodOptional<z.ZodNumber>;
    healthScore: z.ZodNumber;
    riskScore: z.ZodNumber;
    sizeScore: z.ZodOptional<z.ZodNumber>;
    gateDecision: z.ZodEnum<["allow", "warn", "block"]>;
    healthChecks: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    riskFactors: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    sizeFactors: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    evaluationMs: z.ZodNumber;
    reportUrl: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodString>;
    releaseReady: z.ZodOptional<z.ZodBoolean>;
    releaseReadyReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    gateMode: z.ZodOptional<z.ZodString>;
    ci: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
    repoId: z.ZodString;
    commitSha: z.ZodString;
    prNumber: z.ZodOptional<z.ZodNumber>;
    healthScore: z.ZodNumber;
    riskScore: z.ZodNumber;
    sizeScore: z.ZodOptional<z.ZodNumber>;
    gateDecision: z.ZodEnum<["allow", "warn", "block"]>;
    healthChecks: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    riskFactors: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    sizeFactors: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    evaluationMs: z.ZodNumber;
    reportUrl: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodString>;
    releaseReady: z.ZodOptional<z.ZodBoolean>;
    releaseReadyReasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    gateMode: z.ZodOptional<z.ZodString>;
    ci: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.ZodTypeAny, "passthrough">>;
export type EvaluationPayload = z.infer<typeof EvaluationPayload>;
export declare const DeployEventPayload: z.ZodObject<{
    deploymentId: z.ZodString;
    environment: z.ZodString;
    status: z.ZodEnum<["success", "failure", "cancelled"]>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    url: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodString;
    source: z.ZodOptional<z.ZodEnum<["vercel", "generic"]>>;
    repoId: z.ZodOptional<z.ZodString>;
    commitSha: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "success" | "failure" | "cancelled";
    environment: string;
    deploymentId: string;
    timestamp: string;
    repoId?: string | undefined;
    commitSha?: string | undefined;
    source?: "vercel" | "generic" | undefined;
    durationMs?: number | undefined;
    url?: string | undefined;
}, {
    status: "success" | "failure" | "cancelled";
    environment: string;
    deploymentId: string;
    timestamp: string;
    repoId?: string | undefined;
    commitSha?: string | undefined;
    source?: "vercel" | "generic" | undefined;
    durationMs?: number | undefined;
    url?: string | undefined;
}>;
export type DeployEventPayload = z.infer<typeof DeployEventPayload>;
export declare const FeedbackDisposition: z.ZodEnum<["false_positive", "true_positive", "dismissed"]>;
export declare const FeedbackPayload: z.ZodObject<{
    detector: z.ZodString;
    disposition: z.ZodEnum<["false_positive", "true_positive", "dismissed"]>;
    repo: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
    evaluationId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    detector: string;
    disposition: "false_positive" | "true_positive" | "dismissed";
    repo?: string | undefined;
    reason?: string | undefined;
    evaluationId?: string | undefined;
}, {
    detector: string;
    disposition: "false_positive" | "true_positive" | "dismissed";
    repo?: string | undefined;
    reason?: string | undefined;
    evaluationId?: string | undefined;
}>;
export type FeedbackPayload = z.infer<typeof FeedbackPayload>;
export declare const DigestSubscribePayload: z.ZodObject<{
    enabled: z.ZodBoolean;
    channel: z.ZodEnum<["slack", "email", "webhook"]>;
    destination: z.ZodString;
    fpThreshold: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    channel: "slack" | "email" | "webhook";
    destination: string;
    fpThreshold: number;
}, {
    enabled: boolean;
    channel: "slack" | "email" | "webhook";
    destination: string;
    fpThreshold?: number | undefined;
}>;
export type DigestSubscribePayload = z.infer<typeof DigestSubscribePayload>;
export declare const OrgSettingsPatch: z.ZodObject<{
    plan: z.ZodOptional<z.ZodEnum<["free", "pro", "team"]>>;
    seats: z.ZodOptional<z.ZodNumber>;
    sso: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodBoolean;
        provider: z.ZodEnum<["saml", "oidc"]>;
        issuerUrl: z.ZodOptional<z.ZodString>;
        clientId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        provider: "saml" | "oidc";
        issuerUrl?: string | undefined;
        clientId?: string | undefined;
    }, {
        enabled: boolean;
        provider: "saml" | "oidc";
        issuerUrl?: string | undefined;
        clientId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    plan?: "free" | "pro" | "team" | undefined;
    seats?: number | undefined;
    sso?: {
        enabled: boolean;
        provider: "saml" | "oidc";
        issuerUrl?: string | undefined;
        clientId?: string | undefined;
    } | undefined;
}, {
    plan?: "free" | "pro" | "team" | undefined;
    seats?: number | undefined;
    sso?: {
        enabled: boolean;
        provider: "saml" | "oidc";
        issuerUrl?: string | undefined;
        clientId?: string | undefined;
    } | undefined;
}>;
export type OrgSettingsPatch = z.infer<typeof OrgSettingsPatch>;
export interface StoredEvaluation extends EvaluationPayload {
    orgId: string;
    receivedAt: string;
    agentProvenanceId?: string;
}
export interface OrgRecord {
    id: string;
    name: string;
    createdAt: string;
}
export interface OrgSettings {
    plan: PlanTier;
    seats: number;
    seatsUsed: number;
    sso?: {
        enabled: boolean;
        provider: "saml" | "oidc";
        issuerUrl?: string;
        clientId?: string;
    };
    digest?: {
        enabled: boolean;
        channel: "slack" | "email" | "webhook";
        destination: string;
        fpThreshold: number;
    };
    tuning?: {
        autoDowngrade: boolean;
    };
}
export interface QuotaSnapshot {
    plan: PlanTier;
    limit: number;
    used: number;
    remaining: number;
}
export interface RepoRecord {
    id: string;
    orgId: string;
    fullName: string;
    firstSeenAt: string;
    lastEvaluationAt: string;
    evaluationCount: number;
}
export interface ApiKeyRecord {
    keyId: string;
    /** Plaintext key. Only populated at issuance / in the memory store; the
     *  Postgres store never returns plaintext (hash-only per contract). */
    key: string;
    orgId: string;
    orgName: string;
    label?: string;
    /** Payment failure → key resolves but callers must 402. */
    suspended: boolean;
}
export interface SubscriptionRecord {
    id: string;
    orgId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: "pro" | "team";
    status: string;
    currentPeriodEnd: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface CreateOrgWithSubscriptionInput {
    orgName: string;
    githubOrg?: string;
    plan: "pro" | "team";
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: string;
    currentPeriodEnd?: string | null;
    keyLabel?: string;
}
export interface CreateOrgWithSubscriptionResult {
    org: OrgRecord;
    keySecret: string;
    keyRecord: ApiKeyRecord;
}
export interface SubscriptionPatch {
    plan?: "pro" | "team";
    status?: string;
    currentPeriodEnd?: string | null;
}
/** Reconcile / lost-webhook repair: no caller-supplied orgId — the store
 *  resolves (or creates) the org from stripe_customer_id. */
export interface UpsertSubscriptionInput {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: "pro" | "team";
    status: string;
    currentPeriodEnd?: string | null;
}
export type KeyClaimResult = {
    ciphertext: string;
} | {
    alreadyClaimed: true;
} | {
    expired: true;
} | null;
export interface IngestResult {
    created: boolean;
    evaluation: StoredEvaluation;
    /** Soft over-quota (stored) OR plan does not include the cloud store. */
    quotaExceeded?: boolean;
    /** At/above 3× the tier limit — rejected, not stored (429 backstop). */
    hardLimited?: boolean;
}
export interface ManagedApiKey {
    id: string;
    orgId: string;
    key: string;
    label: string;
    keyPreview: string;
    createdAt: string;
    revokedAt: string | null;
}
export interface CloudStore {
    ingestEvaluation(orgId: string, payload: EvaluationPayload, idempotencyKey?: string): Promise<IngestResult>;
    recordDeployEvent(orgId: string, payload: DeployEventPayload): Promise<void>;
    recordFeedback(record: import("./feedback-core.js").DetectorFeedbackRecord): Promise<import("./feedback-core.js").DetectorFeedbackRecord>;
    listFeedback(orgId: string, repoId?: string): Promise<import("./feedback-core.js").DetectorFeedbackRecord[]>;
    listOrgs(): Promise<OrgRecord[]>;
    listRepos(orgId: string): Promise<RepoRecord[]>;
    listEvaluations(orgId: string, repoId?: string, limit?: number, prNumber?: number): Promise<StoredEvaluation[]>;
    getEvaluation(orgId: string, id: string): Promise<StoredEvaluation | null>;
    listAllEvaluations(orgId: string): Promise<StoredEvaluation[]>;
    listDeployEvents(orgId: string): Promise<Array<{
        orgId: string;
        payload: DeployEventPayload;
    }>>;
    getOrgForKey(apiKey: string): Promise<ApiKeyRecord | null>;
    getOrgSettings(orgId: string): Promise<OrgSettings>;
    updateOrgSettings(orgId: string, patch: Partial<OrgSettings>): Promise<OrgSettings>;
    getQuota(orgId: string): Promise<QuotaSnapshot>;
    listManagedKeys(orgId: string): Promise<ManagedApiKey[]>;
    createApiKey(orgId: string, label?: string): Promise<{
        key: ManagedApiKey;
        secret: string;
    }>;
    revokeApiKey(orgId: string, keyId: string): Promise<boolean>;
    listDetectorDowngrades(orgId: string): Promise<import("./tuning-digest.js").DetectorDowngradeRecord[]>;
    recordDetectorDowngrade(orgId: string, record: import("./tuning-digest.js").DetectorDowngradeRecord): Promise<import("./tuning-digest.js").DetectorDowngradeRecord>;
    revertDetectorDowngrade(orgId: string, detectorCode: string, revertedBy: string): Promise<import("./tuning-digest.js").DetectorDowngradeRecord | null>;
    createOrgWithSubscription(input: CreateOrgWithSubscriptionInput): Promise<CreateOrgWithSubscriptionResult>;
    updateSubscriptionByStripeId(stripeSubscriptionId: string, patch: SubscriptionPatch): Promise<string | null>;
    /** Idempotent reconcile: resolve org by stripe_customer_id (create a minimal
     *  org + settings if the webhook was lost), upsert the subscription, sync
     *  plan + key suspension. Returns the affected orgId. */
    upsertSubscriptionFromStripe(sub: UpsertSubscriptionInput): Promise<string>;
    setKeysSuspended(orgId: string, suspended: boolean): Promise<void>;
    recordStripeEvent(eventId: string, eventType: string, payload: unknown): Promise<boolean>;
    /** Rollback for the insert-first idempotency ledger: delete the ledger row
     *  when webhook processing throws AFTER recordStripeEvent, so Stripe's retry
     *  of the same event id is not short-circuited as a duplicate. */
    removeStripeEvent(eventId: string): Promise<void>;
    createKeyClaim(sessionId: string, orgId: string, ciphertext: string, expiresAt: string): Promise<void>;
    claimKey(sessionId: string): Promise<KeyClaimResult>;
    purgeExpiredClaims(): Promise<number>;
    getSubscriptionForOrg(orgId: string): Promise<SubscriptionRecord | null>;
    listSubscriptions(): Promise<SubscriptionRecord[]>;
}
export interface RateLimitState {
    limit: number;
    remaining: number;
    resetAt: number;
}
