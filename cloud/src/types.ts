import { z } from "zod";
import type { PlanTier } from "./billing.js";

export const GateDecision = z.enum(["allow", "warn", "block"]);

export const EvaluationPayload = z
  .object({
    id: z.string().min(1),
    repoId: z.string().min(1),
    commitSha: z.string().min(1),
    prNumber: z.number().int().optional(),
    healthScore: z.number().min(0).max(100),
    riskScore: z.number().min(0).max(100),
    gateDecision: GateDecision,
    healthChecks: z.array(z.record(z.unknown())).default([]),
    riskFactors: z.array(z.record(z.unknown())).default([]),
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

export type EvaluationPayload = z.infer<typeof EvaluationPayload>;

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

export type DeployEventPayload = z.infer<typeof DeployEventPayload>;

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

export type FeedbackPayload = z.infer<typeof FeedbackPayload>;

export const DigestSubscribePayload = z.object({
  enabled: z.boolean(),
  channel: z.enum(["slack", "email", "webhook"]),
  destination: z.string().min(3),
  fpThreshold: z.number().min(0).max(100).default(15),
});

export type DigestSubscribePayload = z.infer<typeof DigestSubscribePayload>;

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

export type KeyClaimResult =
  | { ciphertext: string }
  | { alreadyClaimed: true }
  | { expired: true }
  | null;

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
  ingestEvaluation(
    orgId: string,
    payload: EvaluationPayload,
    idempotencyKey?: string,
  ): Promise<IngestResult>;
  recordDeployEvent(orgId: string, payload: DeployEventPayload): Promise<void>;
  recordFeedback(
    record: import("./feedback-core.js").DetectorFeedbackRecord,
  ): Promise<import("./feedback-core.js").DetectorFeedbackRecord>;
  listFeedback(
    orgId: string,
    repoId?: string,
  ): Promise<import("./feedback-core.js").DetectorFeedbackRecord[]>;
  listOrgs(): Promise<OrgRecord[]>;
  listRepos(orgId: string): Promise<RepoRecord[]>;
  listEvaluations(
    orgId: string,
    repoId?: string,
    limit?: number,
    prNumber?: number,
  ): Promise<StoredEvaluation[]>;
  getEvaluation(orgId: string, id: string): Promise<StoredEvaluation | null>;
  listAllEvaluations(orgId: string): Promise<StoredEvaluation[]>;
  listDeployEvents(
    orgId: string,
  ): Promise<Array<{ orgId: string; payload: DeployEventPayload }>>;
  getOrgForKey(apiKey: string): Promise<ApiKeyRecord | null>;
  getOrgSettings(orgId: string): Promise<OrgSettings>;
  updateOrgSettings(orgId: string, patch: Partial<OrgSettings>): Promise<OrgSettings>;
  getQuota(orgId: string): Promise<QuotaSnapshot>;
  listManagedKeys(orgId: string): Promise<ManagedApiKey[]>;
  createApiKey(
    orgId: string,
    label?: string,
  ): Promise<{ key: ManagedApiKey; secret: string }>;
  revokeApiKey(orgId: string, keyId: string): Promise<boolean>;
  listDetectorDowngrades(
    orgId: string,
  ): Promise<import("./tuning-digest.js").DetectorDowngradeRecord[]>;
  recordDetectorDowngrade(
    orgId: string,
    record: import("./tuning-digest.js").DetectorDowngradeRecord,
  ): Promise<import("./tuning-digest.js").DetectorDowngradeRecord>;
  revertDetectorDowngrade(
    orgId: string,
    detectorCode: string,
    revertedBy: string,
  ): Promise<import("./tuning-digest.js").DetectorDowngradeRecord | null>;

  // --- Billing surface ---
  createOrgWithSubscription(
    input: CreateOrgWithSubscriptionInput,
  ): Promise<CreateOrgWithSubscriptionResult>;
  updateSubscriptionByStripeId(
    stripeSubscriptionId: string,
    patch: SubscriptionPatch,
  ): Promise<string | null>;
  /** Idempotent reconcile: resolve org by stripe_customer_id (create a minimal
   *  org + settings if the webhook was lost), upsert the subscription, sync
   *  plan + key suspension. Returns the affected orgId. */
  upsertSubscriptionFromStripe(sub: UpsertSubscriptionInput): Promise<string>;
  setKeysSuspended(orgId: string, suspended: boolean): Promise<void>;
  recordStripeEvent(
    eventId: string,
    eventType: string,
    payload: unknown,
  ): Promise<boolean>;
  /** Rollback for the insert-first idempotency ledger: delete the ledger row
   *  when webhook processing throws AFTER recordStripeEvent, so Stripe's retry
   *  of the same event id is not short-circuited as a duplicate. */
  removeStripeEvent(eventId: string): Promise<void>;
  createKeyClaim(
    sessionId: string,
    orgId: string,
    ciphertext: string,
    expiresAt: string,
  ): Promise<void>;
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
