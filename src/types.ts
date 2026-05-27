import { z } from "zod";
import type { CiManifest } from "./ci-manifest.js";

export const GateDecision = z.enum(["allow", "warn", "block"]);
export type GateDecision = z.infer<typeof GateDecision>;

export const HealthCheckResult = z.object({
  target: z.string(),
  status: GateDecision,
  latencyMs: z.number(),
  detail: z.record(z.unknown()).optional(),
});
export type HealthCheckResult = z.infer<typeof HealthCheckResult>;

export const RiskFactor = z.object({
  type: z.enum([
    "code_churn",
    "test_coverage",
    "file_count",
    "sensitive_files",
    "author_history",
    "dependency_changes",
    "pr_age",
    "security_alerts",
    "deployment_history",
    "canary_status",
    "ci_integrity",
    "workflow_security",
    "prompt_injection_risk",
    "supply_chain",
    "pr_scope",
    "duplicate_logic",
    "cross_repo_impact",
  ]),
  score: z.number().min(0).max(100),
  detail: z.record(z.unknown()).optional(),
});
export type RiskFactor = z.infer<typeof RiskFactor>;

export const PrProvenance = z.object({
  type: z.enum([
    "human",
    "dependabot",
    "copilot",
    "codex",
    "claude",
    "custom-bot",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
});
export type PrProvenance = z.infer<typeof PrProvenance>;

export const GateMode = z.enum(["release-ready", "advisory", "risk-only"]);
export type GateMode = z.infer<typeof GateMode>;

export const AgentBriefMode = z.enum(["off", "collapsed", "expanded"]);
export type AgentBriefMode = z.infer<typeof AgentBriefMode>;

export const CiCheckStatusEnum = z.enum([
  "pass",
  "fail",
  "skip",
  "pending",
  "stale",
  "missing",
]);
export type CiCheckStatusEnum = z.infer<typeof CiCheckStatusEnum>;

export const CiCheck = z.object({
  name: z.string(),
  status: CiCheckStatusEnum,
  conclusion: z.string().optional(),
  detailsUrl: z.string().url().optional(),
  required: z.boolean(),
});
export type CiCheck = z.infer<typeof CiCheck>;

export const CiSummary = z.object({
  checks: z.array(CiCheck),
  allRequiredPassed: z.boolean(),
  pendingCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  missingCount: z.number().int().min(0),
});
export type CiSummary = z.infer<typeof CiSummary>;

export const MatchedContext = z.object({
  name: z.string(),
  environment: z.string().optional(),
});
export type MatchedContext = z.infer<typeof MatchedContext>;

export const RemediationSeverity = z.enum(["blocking", "warn", "advisory"]);
export type RemediationSeverity = z.infer<typeof RemediationSeverity>;

export const RemediationAutofixClass = z.enum([
  "format",
  "lint",
  "import-fix",
  "type-narrow",
  "test-scaffold",
  "doc-update",
  "dependency-bump",
]);
export type RemediationAutofixClass = z.infer<typeof RemediationAutofixClass>;

export const RemediationFix = z.object({
  code: z.string(),
  severity: RemediationSeverity,
  title: z.string(),
  detail: z.string(),
  files: z.array(z.string()).default([]),
  suggested_action: z.string().optional(),
  suggested_command: z.string().optional(),
  autofix_eligible: z.boolean().default(false),
  autofix_class: RemediationAutofixClass.optional(),
  policy_link: z.string().url().optional(),
});
export type RemediationFix = z.infer<typeof RemediationFix>;

export const RemediationNextAction = z.enum([
  "ready_to_merge",
  "fix_and_retry",
  "human_review_required",
  "max_rounds_exceeded",
]);
export type RemediationNextAction = z.infer<typeof RemediationNextAction>;

export const Remediation = z.object({
  schema: z.literal("trailhead.remediation.v1").default("trailhead.remediation.v1"),
  release_ready: z.boolean(),
  fixes: z.array(RemediationFix),
  blocking_count: z.number().int().min(0),
  warn_count: z.number().int().min(0),
  advisory_count: z.number().int().min(0),
  autofix_eligible_count: z.number().int().min(0),
  loop_round: z.number().int().min(0).default(0),
  max_loop_rounds: z.number().int().min(0).default(3),
  previous_evaluation_id: z.string().optional(),
  fixes_resolved: z.array(z.string()).default([]),
  fixes_introduced: z.array(z.string()).default([]),
  next_action: RemediationNextAction,
});
export type Remediation = z.infer<typeof Remediation>;

export const GateEvaluation = z.object({
  id: z.string(),
  repoId: z.string(),
  commitSha: z.string(),
  prNumber: z.number().optional(),
  healthScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  gateDecision: GateDecision,
  healthChecks: z.array(HealthCheckResult),
  riskFactors: z.array(RiskFactor),
  files: z.array(z.string()).optional(),
  evaluationMs: z.number(),
  reportUrl: z.string().url().optional(),
  environment: z.string().optional(),
  service: z.string().optional(),
  policyFindings: z.array(z.string()).optional(),
  pr: z
    .object({
      provenance: PrProvenance.optional(),
      headRef: z.string().optional(),
    })
    .optional(),
  session_correlation: z
    .object({
      burst_count: z.number().int().min(0),
      window: z.string(),
    })
    .optional(),
  escalation_status: z
    .object({
      enabled: z.boolean(),
      target_count: z.number().int().min(0),
      acknowledge_sla_minutes: z.number().int().min(1).optional(),
      resolve_sla_minutes: z.number().int().min(1).optional(),
    })
    .optional(),
  trust_profile: z
    .object({
      strictness: z.enum(["baseline", "elevated", "strict"]),
      reason: z.string(),
    })
    .optional(),
  policyOverride: z
    .object({
      owner: z.string(),
      reason: z.string(),
      linkedTicket: z.string(),
      expiresAt: z.string(),
      appliedAt: z.string(),
      changes: z
        .object({
          failMode: z.enum(["open", "closed"]).optional(),
          riskThreshold: z.number().min(0).max(100).optional(),
          warnThreshold: z.number().min(0).max(100).optional(),
        })
        .default({}),
    })
    .optional(),
  releaseReady: z.boolean().optional(),
  releaseReadyReasons: z.array(z.string()).optional(),
  ci: CiSummary.optional(),
  context: MatchedContext.optional(),
  gateMode: GateMode.optional(),
  storePersisted: z.boolean().optional(),
  remediation: Remediation.optional(),
  agentBriefMode: AgentBriefMode.optional(),
  cross_repo_impact: z
    .object({
      services: z.array(
        z.object({
          serviceName: z.string(),
          touchedFiles: z.array(z.string()),
          consumers: z.array(
            z.object({
              id: z.string(),
              repo: z.string().optional(),
              branch: z.string().optional(),
            }),
          ),
          notify_webhook: z.string().url().optional(),
        }),
      ),
    })
    .optional(),
});
export type GateEvaluation = z.infer<typeof GateEvaluation>;

export const GateApiResponse = z.object({
  id: z.string().optional(),
  reportUrl: z.string().url().optional(),
  healthScore: z.number().min(0).max(100).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  gateDecision: GateDecision.optional(),
  healthChecks: z.array(HealthCheckResult).optional(),
  riskFactors: z.array(RiskFactor).optional(),
});
export type GateApiResponse = z.infer<typeof GateApiResponse>;

export const FreezeWindow = z.object({
  days: z.array(z.string()).default([]),
  afterHour: z.number().min(0).max(23).optional(),
  beforeHour: z.number().min(0).max(23).optional(),
  timezone: z.string().default("UTC"),
  message: z.string().optional(),
});
export type FreezeWindow = z.infer<typeof FreezeWindow>;

export const EnvironmentConfig = z.object({
  risk: z.number().min(0).max(100).optional(),
  warn: z.number().min(0).max(100).optional(),
  require_security_clear: z.boolean().optional(),
});
export type EnvironmentConfig = z.infer<typeof EnvironmentConfig>;

export const ServiceConsumerRef = z.object({
  repo: z.string().min(1),
  name: z.string().optional(),
  branch: z.string().optional(),
  notify_webhook: z.string().url().optional(),
});

export const ServiceConsumer = z.union([z.string(), ServiceConsumerRef]);
export type ServiceConsumer = z.infer<typeof ServiceConsumer>;

export const ConsumerRegistry = z.record(z.string(), ServiceConsumerRef);
export type ConsumerRegistry = z.infer<typeof ConsumerRegistry>;

export const ServiceMapping = z.object({
  paths: z.array(z.string()),
  environment: z.string().optional(),
  consumers: z.array(ServiceConsumer).default([]),
  contracts: z.array(z.string()).default([]),
  notify_webhook: z.string().url().optional(),
});
export type ServiceMapping = z.infer<typeof ServiceMapping>;

export const SecurityConfig = z.object({
  severity_threshold: z.enum(["error", "warning", "note", "none"]).default("warning"),
  block_on_critical: z.boolean().default(true),
  ignore_rules: z.array(z.string()).default([]),
});
export type SecurityConfig = z.infer<typeof SecurityConfig>;

export const CanaryConfig = z.object({
  webhook_type: z.enum(["vercel", "generic"]).default("vercel"),
  field_map: z.record(z.string()).optional(),
  rollback_on_failure: z.boolean().default(false),
});
export type CanaryConfig = z.infer<typeof CanaryConfig>;

export const RiskProfileMatch = z.object({
  files_include: z.array(z.string()).default([]),
  files_exclude: z.array(z.string()).default([]),
  min_files: z.number().int().min(1).optional(),
  max_files: z.number().int().min(1).optional(),
});
export type RiskProfileMatch = z.infer<typeof RiskProfileMatch>;

export const RiskProfile = z.object({
  name: z.string().optional(),
  match: RiskProfileMatch,
  weights: z.record(z.number().min(0).max(10)).default({}),
});
export type RiskProfile = z.infer<typeof RiskProfile>;

export const ContextMatch = z.object({
  base_branch: z.array(z.string()).default([]),
  head_branch: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});
export type ContextMatch = z.infer<typeof ContextMatch>;

export const ContextCiConfig = z.object({
  required_checks: z.array(z.string()).default([]),
  optional_checks: z.array(z.string()).default([]),
  missing_required: z.enum(["fail", "skip"]).default("fail"),
});
export type ContextCiConfig = z.infer<typeof ContextCiConfig>;

export const TrailheadContext = z.object({
  name: z.string(),
  match: ContextMatch,
  environment: z.string().optional(),
  thresholds: z
    .object({
      risk: z.number().min(0).max(100).optional(),
      warn: z.number().min(0).max(100).optional(),
    })
    .default({}),
  ci: ContextCiConfig.default({}),
});
export type TrailheadContext = z.infer<typeof TrailheadContext>;

export const GateConfig = z.object({
  mode: GateMode.default("risk-only"),
  check_name: z.string().default("Trailhead — Release Ready"),
  agent_brief: AgentBriefMode.optional(),
});
export type GateConfig = z.infer<typeof GateConfig>;

export const RemediationConfig = z.object({
  enabled: z.boolean().default(true),
  max_loop_rounds: z.number().int().min(0).default(3),
});
export type RemediationConfig = z.infer<typeof RemediationConfig>;

export const RepoConfig = z.object({
  schema_version: z.number().int().positive().default(1),
  gate: GateConfig.default({}),
  remediation: RemediationConfig.optional(),
  contexts: z.array(TrailheadContext).default([]),
  sensitivity: z
    .object({
      high: z.array(z.string()).default([]),
      medium: z.array(z.string()).default([]),
      low: z.array(z.string()).default([]),
    })
    .default({}),
  weights: z.record(z.number().min(0).max(10)).default({}),
  profiles: z.array(RiskProfile).default([]),
  thresholds: z
    .object({
      risk: z.number().min(0).max(100).optional(),
      warn: z.number().min(0).max(100).optional(),
    })
    .default({}),
  ignore: z.array(z.string()).default([]),
  freeze: z.array(FreezeWindow).default([]),
  environments: z.record(EnvironmentConfig).default({}),
  services: z.record(ServiceMapping).default({}),
  consumer_registry: z.record(ServiceConsumerRef).default({}),
  security: SecurityConfig.default({}),
  canary: CanaryConfig.optional(),
  escalation: z
    .object({
      targets: z.array(z.string()).default([]),
      acknowledge_sla_minutes: z.number().int().min(1).default(30),
      resolve_sla_minutes: z.number().int().min(1).default(240),
    })
    .default({}),
  policies: z
    .object({
      agent_prs: z
        .object({
          enabled: z.boolean().default(false),
          risk_threshold: z.number().min(0).max(100).optional(),
          required_approvals: z.number().int().min(0).default(1),
          require_code_owner_approval: z.boolean().default(false),
          code_owner_reviewers: z.array(z.string()).default([]),
          sensitive_paths: z.array(z.string()).default([]),
          strict_on_unknown_provenance: z.boolean().default(true),
        })
        .default({}),
      session_correlation: z
        .object({
          enabled: z.boolean().default(false),
          threshold: z.number().int().min(2).default(3),
          window_minutes: z.number().int().min(5).default(60),
          mode: z.enum(["warn", "block"]).default("warn"),
        })
        .default({}),
      ci_integrity: z
        .object({
          enabled: z.boolean().default(true),
          mode: z.enum(["warn", "block"]).default("block"),
        })
        .default({}),
      workflow_security: z
        .object({
          enabled: z.boolean().default(true),
          mode: z.enum(["warn", "block"]).default("block"),
          allow_unpinned_actions: z.array(z.string()).default([]),
        })
        .default({}),
      prompt_injection: z
        .object({
          enabled: z.boolean().default(true),
          mode: z.enum(["warn", "block"]).default("block"),
        })
        .default({}),
      supply_chain: z
        .object({
          enabled: z.boolean().default(true),
          mode: z.enum(["warn", "block"]).default("warn"),
          force_score_on_critical: z.number().min(0).max(100).default(80),
        })
        .default({}),
      pr_scope: z
        .object({
          enabled: z.boolean().default(true),
          max_files: z.number().int().min(1).default(50),
          max_changes: z.number().int().min(1).default(2000),
          mode: z.enum(["warn", "block"]).default("warn"),
          require_plan_for_agent_prs: z.boolean().default(false),
        })
        .default({}),
      duplicate_logic: z
        .object({
          enabled: z.boolean().default(true),
          mode: z.enum(["warn", "block"]).default("warn"),
        })
        .default({}),
      cross_repo_impact: z
        .object({
          enabled: z.boolean().default(true),
          mode: z.enum(["warn", "block"]).default("warn"),
          consumer_registry_path: z.string().optional(),
        })
        .default({}),
    })
    .default({}),
});
export type RepoConfig = z.infer<typeof RepoConfig>;

export interface TrailheadConfig {
  apiKey: string;
  apiUrl: string;
  githubToken?: string;
  healthCheckUrls: string[];
  riskThreshold: number;
  warnThreshold?: number;
  failMode: "open" | "closed";
  selfHeal: boolean;
  addRiskLabels: boolean;
  reviewersOnRisk: string[];
  webhookUrl?: string;
  webhookEvents: string[];
  evaluationStoreUrl?: string;
  trailheadApiKey?: string;
  environment?: string;
  securityGate?: boolean;
  gateMode?: GateMode;
  waitForChecks?: boolean;
  waitTimeoutMinutes?: number;
  checkName?: string;
  ciManifest?: CiManifest | null;
  ciManifestPath?: string;
  agentBrief?: AgentBriefMode;
}

export interface TestRepairResult {
  testFile: string;
  failureType: string;
  strategy: string;
  success: boolean;
  diff?: string;
}
