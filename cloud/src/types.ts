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
  key: string;
  orgId: string;
  orgName: string;
  label?: string;
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
  ): {
    created: boolean;
    evaluation: StoredEvaluation;
    quotaExceeded?: boolean;
  };
  recordDeployEvent(orgId: string, payload: DeployEventPayload): void;
  recordFeedback(
    record: import("./feedback-core.js").DetectorFeedbackRecord,
  ): import("./feedback-core.js").DetectorFeedbackRecord;
  listFeedback(
    orgId: string,
    repoId?: string,
  ): import("./feedback-core.js").DetectorFeedbackRecord[];
  listOrgs(): OrgRecord[];
  listRepos(orgId: string): RepoRecord[];
  listEvaluations(
    orgId: string,
    repoId?: string,
    limit?: number,
    prNumber?: number,
  ): StoredEvaluation[];
  getEvaluation(orgId: string, id: string): StoredEvaluation | null;
  listAllEvaluations(orgId: string): StoredEvaluation[];
  listDeployEvents(orgId: string): Array<{ orgId: string; payload: DeployEventPayload }>;
  getOrgForKey(apiKey: string): ApiKeyRecord | null;
  getOrgSettings(orgId: string): OrgSettings;
  updateOrgSettings(orgId: string, patch: Partial<OrgSettings>): OrgSettings;
  getQuota(orgId: string): QuotaSnapshot;
  listManagedKeys(orgId: string): ManagedApiKey[];
  createApiKey(orgId: string, label?: string): { key: ManagedApiKey; secret: string };
  revokeApiKey(orgId: string, keyId: string): boolean;
  listDetectorDowngrades(
    orgId: string,
  ): import("./tuning-digest.js").DetectorDowngradeRecord[];
  recordDetectorDowngrade(
    orgId: string,
    record: import("./tuning-digest.js").DetectorDowngradeRecord,
  ): import("./tuning-digest.js").DetectorDowngradeRecord;
  revertDetectorDowngrade(
    orgId: string,
    detectorCode: string,
    revertedBy: string,
  ): import("./tuning-digest.js").DetectorDowngradeRecord | null;
}

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: number;
}
