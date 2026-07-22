export {
  evaluateGate,
  formatGateReport,
  computeRiskScore,
  isSensitiveFile,
  sensitivityWeight,
  suggestSplitBoundaries,
  isInFreezeWindow,
  isRollback,
  checkHealth,
  checkVercelHealth,
  checkSupabaseHealth,
  checkMcpHealth,
  decideGate,
  matchesGlobs,
  postPrComment,
  createCheckRun,
  managePrLabels,
  requestHighRiskReviewers,
} from "./gate.js";
export {
  FACTOR_WEIGHTS,
  weightedAverageScores,
  detectDependencyChanges,
  computeSecurityFactor,
  computeDeploymentHistoryFactor,
  decideSensitiveFilesEscalation,
  splitSizeFactors,
  sizeFactorsAreMetadata,
  configuredSizeFactorTypes,
} from "./risk-engine.js";
export type {
  FileInfo,
  RiskFactorResult,
  RiskConfig,
  SecurityAlertCounts,
  DeploymentOutcomeSummary,
  GateDecisionValue,
} from "./risk-engine.js";
export {
  fetchCodeScanningAlerts,
  computeSecurityRiskFactor,
  decideSecurityBlock,
  formatSecuritySection,
} from "./security.js";
export {
  parseVercelWebhook,
  parseGenericWebhook,
  recordDeployOutcome,
  fetchRecentDeployOutcomes,
  computeCanaryRiskFactor,
} from "./canary.js";
export type { DeployOutcome } from "./canary.js";
export {
  sendWebhook,
  deliverWebhooks,
  deliverWebhookEvent,
  storeEvaluation,
  storeEvaluationDetailed,
} from "./notify.js";
export type { CloudStoreOutcome } from "./notify.js";
export {
  buildCloudFooterLine,
  CLOUD_MARKETING_URL,
  CLOUD_PRICING_URL,
} from "./cloud-upsell.js";
export type { CloudFooterOptions, CloudUpsellCampaign } from "./cloud-upsell.js";
export {
  meterDeployCheck,
  resolveCreditMeterConfig,
  resolveCreditMeterUserFromEnv,
} from "./credit-meter.js";
export type {
  CreditMeterConfig,
  CreditMeterResult,
  CreditMeterUser,
} from "./credit-meter.js";
export {
  parseWebhookEvents,
  resolveTrailheadEventTypes,
  resolveWebhookDeliveries,
} from "./trailhead-events.js";
export {
  attemptRepair,
  registerHealer,
  getHealerFor,
  clearHealers,
} from "./healers/index.js";
export { jestHealer } from "./healers/jest.js";
export { playwrightHealer } from "./healers/playwright.js";
export { cypressHealer } from "./healers/cypress.js";
export { loadRepoConfig } from "./config.js";
export { matchContext, resolveGateMode } from "./context-matcher.js";
export { evaluateReleaseEvidence } from "./release-evidence.js";
export {
  classifyCheck,
  evaluateRequiredChecks,
  fetchCheckRuns,
  waitForChecks,
  formatCiStatusIcon,
} from "./ci-orchestrator.js";
export { checkNameMatches, normalizeCheckRuns } from "./ci-core.js";
export {
  computeReleaseReady,
  shouldBlockMerge,
  resolveCheckName,
} from "./release-ready.js";
export {
  computeDoraMetrics,
  formatDoraReport,
  formatDeploymentFrequencyForOutput,
} from "./dora.js";
export { exportOtelSpan } from "./otel.js";
export type { DoraMetrics, DoraRating } from "./dora.js";
export type {
  GateEvaluation,
  GateDecision,
  GateApiResponse,
  HealthCheckResult,
  RiskFactor,
  RepoConfig,
  TrailheadConfig,
  TestRepairResult,
  EnvironmentConfig,
  ServiceMapping,
  SecurityConfig,
  CanaryConfig,
  ReleaseEvidenceConfig,
  FreezeWindow,
  GateMode,
  TrailheadContext,
  CiSummary,
  CiCheck,
} from "./types.js";
