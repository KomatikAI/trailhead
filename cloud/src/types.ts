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

export interface StoredEvaluation extends EvaluationPayload {
  orgId: string;
  receivedAt: string;
}

export interface OrgRecord {
  id: string;
  name: string;
  createdAt: string;
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
  key: string;
  orgId: string;
  orgName: string;
}

export interface CloudStore {
  ingestEvaluation(
    orgId: string,
    payload: EvaluationPayload,
    idempotencyKey?: string,
  ): { created: boolean; evaluation: StoredEvaluation };
  recordDeployEvent(orgId: string, payload: DeployEventPayload): void;
  listOrgs(): OrgRecord[];
  listRepos(orgId: string): RepoRecord[];
  listEvaluations(orgId: string, repoId?: string, limit?: number): StoredEvaluation[];
  getOrgForKey(apiKey: string): ApiKeyRecord | null;
}

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: number;
}
