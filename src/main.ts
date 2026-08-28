import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  buildCannotEvaluateBrief,
  evaluateGate,
  formatGateReport,
  getResolvedAvailabilityStance,
  getResolvedCheckContract,
  postPrComment,
  createCheckRun,
  updateCheckRunReport,
  managePrLabels,
  requestHighRiskReviewers,
  shouldBlockMerge,
  resolveCheckName,
  wrapCollapsibleSection,
  type EvaluationPrMetadata,
} from "./gate.js";
import { renderReleaseBrief } from "./release-brief.js";
import { deliverWebhooks, storeEvaluationDetailed } from "./notify.js";
import { buildCloudFooterLine } from "./cloud-upsell.js";
import {
  meterDeployCheck,
  resolveCreditMeterConfig,
  resolveCreditMeterUserFromEnv,
} from "./credit-meter.js";
import {
  computeDoraMetrics,
  formatDoraReport,
  formatDeploymentFrequencyForOutput,
} from "./dora.js";
import { exportOtelSpan } from "./otel.js";
import { registerHealer, attemptRepair } from "./healers/index.js";
import { jestHealer } from "./healers/jest.js";
import { playwrightHealer } from "./healers/playwright.js";
import { cypressHealer } from "./healers/cypress.js";
import { fetchCodeScanningAlerts, formatSecuritySection } from "./security.js";
import { resolveEvaluationStoreUrl } from "./cloud-config.js";
import { resolveCiManifests } from "./ci-external.js";
import { computeRolloutReadiness } from "./rollout-readiness.js";
import { resolveAgentProvenanceId } from "./agent-provenance.js";
import { readTrustRuntime } from "./trust-runtime.js";
import { buildGateVerdict } from "./verdict.js";
import { runGateAutofix, type GateAutofixClient } from "./gate-autofix.js";
import { runCrossRepoOpener, type CrossRepoOpenerClient } from "./cross-repo-opener.js";
import { loadRepoConfig } from "./config.js";
import { resolveGateMode } from "./context-matcher.js";
import { loadCatalogIndex, loadCatalogOwners } from "./catalog-index.js";
import { resolveEvaluationTarget } from "./github-event.js";
import { OVERRIDE_LABEL } from "./override.js";
import type {
  GateEvaluation,
  GateMode,
  TrailheadConfig,
  TestRepairResult,
  PolicyOverrideAudit,
} from "./types.js";

class PolicyOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyOverrideError";
  }
}

function parseEvaluationStoreRetries(raw: string): number {
  if (!raw) return 3;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 10) {
    core.warning("evaluation-store-retries must be 0–10; using default 3");
    return 3;
  }
  return parsed;
}

function initHealers(): void {
  registerHealer(jestHealer);
  registerHealer(playwrightHealer);
  registerHealer(cypressHealer);
}

function readEnv(primary: string, legacy?: string): string | undefined {
  return process.env[primary] ?? (legacy ? process.env[legacy] : undefined);
}

function parseThresholdInput(name: string): number | undefined {
  const value = core.getInput(name);
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    throw new PolicyOverrideError(`${name} must be an integer between 0 and 100`);
  }
  return parsed;
}

function resolveFailMode(
  failModeInput: string,
  environment: string | undefined,
): "open" | "closed" {
  const explicitFailMode = failModeInput as "open" | "closed" | "";
  if (explicitFailMode === "open" || explicitFailMode === "closed") {
    return explicitFailMode;
  }
  return environment === "production" ? "closed" : "open";
}

function isForkPullRequestContext(): boolean {
  if (
    github.context.eventName !== "pull_request" &&
    github.context.eventName !== "pull_request_review"
  ) {
    return false;
  }
  const pullRequest = github.context.payload?.pull_request as
    | { head?: { repo?: { fork?: boolean } } }
    | undefined;
  return pullRequest?.head?.repo?.fork === true;
}

function customCheckRecoveryGuidance(missingToken = false): string {
  if (isForkPullRequestContext()) {
    if (github.context.eventName === "pull_request_review") {
      return (
        "This is a fork `pull_request_review` event; its token is read-only and " +
        "cannot publish the protected custom check. The no-checkout " +
        "`pull_request_target` publisher does not receive review events and cannot " +
        "repair this publication. Use an installed GitHub App or external publisher " +
        "that listens to pull-request review webhooks with a write-capable installation " +
        "token, and pin that App as the required-check source. Re-running this workflow " +
        "cannot repair the permission boundary."
      );
    }
    return (
      "This is a fork `pull_request`; its token is read-only and cannot publish the " +
      "protected custom check. Use the no-checkout `pull_request_target` publisher " +
      "documented in `docs/getting-started.md`, or an installed GitHub App token and " +
      "pin that App. Re-running or reapplying the override label in this workflow " +
      "cannot repair the permission boundary."
    );
  }
  return missingToken
    ? "Configure `github-token` and re-run the normal PR workflow."
    : `Restore GitHub Checks access and re-run; applying or reapplying ` +
        `\`${OVERRIDE_LABEL}\` triggers \`pull_request:labeled\`.`;
}

function checkReportRefreshFailureMessage(
  checkName: string,
  headSha: string,
  eventName: string,
): string {
  return (
    `Published custom check \`${checkName}\` on \`${headSha}\` from \`${eventName}\`, ` +
    "but its embedded Release Brief could not be refreshed with the publication record " +
    "after two attempts. Branch protection can use the published conclusion, but the " +
    "check body is stale. Use the job summary or PR comment for the final state, restore " +
    "GitHub Checks update access, and re-run."
  );
}

/**
 * Swap the gate-report section inside the assembled full report.
 *
 * The FUNCTION form of `String.prototype.replace` is mandatory here: with a
 * string replacement, `$&`, `` $` ``, `$'`, `$$` and `$1` in the REPLACEMENT are
 * expanded as patterns. Gate reports are arbitrary rendered markdown containing
 * user/CI text, so a report holding a literal `$&` would silently duplicate the
 * matched region into the published check and PR comment.
 */
function replaceGateReport(
  fullReport: string,
  previous: string,
  updated: string,
): string {
  return fullReport.replace(previous, () => updated);
}

/** Linear backoff base between D3 refresh attempts, in ms. */
const CHECK_REPORT_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshCheckReport(
  publication: Awaited<ReturnType<typeof createCheckRun>>,
  evaluation: GateEvaluation,
  report: string,
  token: string,
  attempts: number,
): Promise<boolean> {
  // Without an id there is nothing to update, and updateCheckRunReport would
  // warn identically on every pass. Retrying that is pure noise.
  if (!publication.published || !publication.checkRunId) {
    return updateCheckRunReport(publication, evaluation, report, token);
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      // A refresh failure is usually a transient Checks API error or a
      // secondary-rate-limit; an immediate retry re-hits the same window.
      await sleep(CHECK_REPORT_RETRY_DELAY_MS * attempt);
    }
    if (await updateCheckRunReport(publication, evaluation, report, token)) {
      return true;
    }
  }
  return false;
}

function resolvePolicyOverride(): PolicyOverrideAudit | null {
  const overrideFailModeRaw = core.getInput("override-fail-mode");
  const overrideFailMode =
    overrideFailModeRaw === "open" || overrideFailModeRaw === "closed"
      ? overrideFailModeRaw
      : undefined;
  const overrideRiskThreshold = parseThresholdInput("override-risk-threshold");
  const overrideWarnThreshold = parseThresholdInput("override-warn-threshold");
  const hasOverride =
    overrideFailMode !== undefined ||
    overrideRiskThreshold !== undefined ||
    overrideWarnThreshold !== undefined;

  if (!hasOverride) return null;

  const reason = core.getInput("override-reason").trim();
  const owner = core.getInput("override-owner").trim();
  const linkedTicket = core.getInput("override-ticket").trim();
  const expiresAt = core.getInput("override-expires-at").trim();

  if (!reason || !owner || !linkedTicket || !expiresAt) {
    throw new PolicyOverrideError(
      "Overrides require override-reason, override-owner, override-ticket, and override-expires-at",
    );
  }

  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    throw new PolicyOverrideError(
      "override-expires-at must be a valid ISO-8601 datetime",
    );
  }
  if (expiresMs <= Date.now()) {
    throw new PolicyOverrideError(
      `Override expired at ${expiresAt}. Extend expiry before applying.`,
    );
  }

  return {
    source: "workflow",
    owner,
    reason,
    linkedTicket,
    expiresAt: new Date(expiresMs).toISOString(),
    appliedAt: new Date().toISOString(),
    changes: {
      failMode: overrideFailMode,
      riskThreshold: overrideRiskThreshold,
      warnThreshold: overrideWarnThreshold,
    },
  };
}

async function runSelfHeal(
  config: TrailheadConfig,
  prNumber: number,
): Promise<TestRepairResult[]> {
  const results: TestRepairResult[] = [];
  const testFailures = readEnv("TRAILHEAD_TEST_FAILURES", "DEPLOYGUARD_TEST_FAILURES");
  if (!testFailures) return results;

  let failures: Array<{ file: string; error: string }>;
  try {
    failures = JSON.parse(testFailures) as Array<{ file: string; error: string }>;
  } catch {
    core.debug("Could not parse TRAILHEAD_TEST_FAILURES — skipping self-heal");
    return results;
  }

  for (const { file, error } of failures) {
    const repairResult = await attemptRepair(file, error);
    if (repairResult) {
      results.push(repairResult);
      if (repairResult.success && repairResult.diff && config.githubToken) {
        try {
          const octokit = github.getOctokit(config.githubToken);
          const { owner, repo } = github.context.repo;
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: [
              `### Trailhead Self-Heal Suggestion`,
              ``,
              `Test file \`${repairResult.testFile}\` failed ` +
                `(\`${repairResult.failureType}\`). ` +
                `Strategy **${repairResult.strategy}** produced a fix:`,
              ``,
              "```diff",
              repairResult.diff,
              "```",
              ``,
              `> This is a suggestion — review before applying.`,
            ].join("\n"),
          });
        } catch (err) {
          core.debug(`Failed to post self-heal suggestion: ${err}`);
        }
      }
    }
  }

  return results;
}

/**
 * ADR-011 §4 — the matched context's availability stance wins over the action-input
 * fail-mode. Absent a stance (no context matched, or the run failed before matching)
 * behaviour is exactly what it was before ADR-011.
 */
function resolveEffectiveFailMode(environment: string | undefined): "open" | "closed" {
  const stance = getResolvedAvailabilityStance();
  if (stance === "fail_open") return "open";
  if (stance === "fail_closed") return "closed";
  return resolveFailMode(core.getInput("fail-mode"), environment);
}

/**
 * Post (or edit in place) the cannot-evaluate Release Brief on the PR. Deliberately
 * swallows every failure of its own: the caller is already reporting a real error and
 * must not have it replaced by "could not post a comment".
 */
async function postCannotEvaluateBrief(
  error: unknown,
  failMode: "open" | "closed",
): Promise<void> {
  try {
    const githubToken =
      core.getInput("github-token") || process.env.GITHUB_TOKEN || undefined;
    // backfill/re-evaluation runs suppress PR comments (see evaluate-pr above).
    const backfillMode = Boolean(core.getInput("evaluate-pr").trim());
    const reason = String(error instanceof Error ? error.message : error);
    const brief = buildCannotEvaluateBrief(
      reason,
      failMode === "open" ? "fail_open" : "fail_closed",
    );
    const { commitSha, prNumber } = resolveEvaluationTarget(github.context);
    const resolvedContract = getResolvedCheckContract();
    const gateModeInput = core.getInput("gate-mode");
    const inputMode: GateMode | undefined =
      gateModeInput === "release-ready" ||
      gateModeInput === "advisory" ||
      gateModeInput === "risk-only"
        ? gateModeInput
        : undefined;
    // Failures can happen before evaluateGate has loaded .trailhead.yml (for
    // example, while validating an action-level policy override). In that case
    // branch protection still expects the repository-configured check contract,
    // so resolve it here rather than silently falling back to the legacy name.
    //
    // This load is BEST-EFFORT and must never abort the rest of this function.
    // Everything below it — the check publication and the PR comment that ADR-011
    // §1 owes the PR — used to happen with no config load at all; letting a
    // throw here escape into the outer catch would silently drop both.
    let repoConfig: Awaited<ReturnType<typeof loadRepoConfig>> | null = null;
    if (!resolvedContract) {
      try {
        repoConfig = await loadRepoConfig(githubToken);
      } catch (configError) {
        core.debug(
          `Could not load repo config while building the cannot-evaluate brief: ${configError}`,
        );
      }
    }
    const gateMode =
      resolvedContract?.mode ??
      resolveGateMode(repoConfig?.gate?.mode, repoConfig?.schema_version ?? 1, inputMode);
    const checkName =
      resolvedContract?.name ??
      resolveCheckName(
        gateMode,
        core.getInput("check-name") || repoConfig?.gate?.check_name,
      );
    const failOpen = failMode === "open";
    const evaluation: GateEvaluation = {
      id: `dg-cannot-${commitSha.substring(0, 7) || "unknown"}-${Date.now()}`,
      repoId: `${github.context.repo.owner}/${github.context.repo.repo}`,
      commitSha,
      prNumber,
      healthScore: 0,
      riskScore: 0,
      gateDecision: failOpen ? "allow" : "block",
      healthChecks: [],
      riskFactors: [],
      evaluationMs: 0,
      gateMode,
      resolvedCheckName: checkName,
      releaseReady: failOpen,
      releaseReadyReasons: failOpen ? undefined : [reason],
      releaseBrief: brief,
    };

    let publication: Awaited<ReturnType<typeof createCheckRun>> | undefined;
    if (githubToken && !backfillMode) {
      publication = await createCheckRun(
        evaluation,
        renderReleaseBrief(brief),
        githubToken,
        checkName,
      );
    }

    const eventName = github.context.eventName || "unknown";
    const message = publication
      ? publication.published
        ? `Published ${failOpen ? "fail-open" : "fail-closed"} cannot-evaluate custom check ` +
          `\`${checkName}\` on \`${commitSha}\` from \`${eventName}\`.`
        : publication.superseded
          ? `Did not publish custom check \`${checkName}\` on \`${commitSha}\`: run ` +
            `${publication.supersededByRunId} already published a newer evaluation for ` +
            "this PR revision. No action needed."
          : `Could not publish custom check \`${checkName}\` on \`${commitSha}\` from ` +
            `\`${eventName}\`; this run cannot satisfy branch protection. ` +
            customCheckRecoveryGuidance()
      : backfillMode
        ? `Backfill mode did not publish custom check \`${checkName}\` on \`${commitSha}\`.`
        : `No GitHub token was available to publish custom check \`${checkName}\` on ` +
          `\`${commitSha}\`; this run cannot satisfy branch protection. ` +
          customCheckRecoveryGuidance(true);
    brief.requiredCheck = {
      published: publication?.published ?? false,
      reportRefreshed: publication?.published ?? false,
      name: checkName,
      headSha: commitSha,
      eventName,
      message,
      ...(publication?.superseded ? { superseded: true } : {}),
    };

    let renderedBrief = renderReleaseBrief(brief);
    if (publication?.published && githubToken) {
      const reportRefreshed = await refreshCheckReport(
        publication,
        evaluation,
        renderedBrief,
        githubToken,
        2,
      );
      if (!reportRefreshed) {
        brief.requiredCheck.reportRefreshed = false;
        brief.requiredCheck.message = checkReportRefreshFailureMessage(
          checkName,
          commitSha,
          eventName,
        );
        renderedBrief = renderReleaseBrief(brief);
      }
    }
    core.setOutput("evaluation-json", JSON.stringify(evaluation));
    core.setOutput("release-brief-json", JSON.stringify(brief));
    if (githubToken && prNumber && !backfillMode) {
      await postPrComment(renderedBrief, prNumber, githubToken);
    }
  } catch (postError) {
    core.debug(`Cannot-evaluate brief could not be posted: ${postError}`);
  }
}

async function run(): Promise<void> {
  try {
    initHealers();
    const environment = core.getInput("environment") || undefined;
    const policyOverride = resolvePolicyOverride();
    const failMode = resolveFailMode(core.getInput("fail-mode"), environment);

    const gateModeInput = core.getInput("gate-mode");
    const gateMode =
      gateModeInput === "release-ready" ||
      gateModeInput === "advisory" ||
      gateModeInput === "risk-only"
        ? gateModeInput
        : undefined;

    const agentBriefInput = core.getInput("agent-brief");
    const agentBrief =
      agentBriefInput === "off" ||
      agentBriefInput === "collapsed" ||
      agentBriefInput === "expanded"
        ? agentBriefInput
        : undefined;

    const trailheadApiKey = core.getInput("trailhead-api-key") || "";
    const evaluationStoreUrl = resolveEvaluationStoreUrl({
      trailheadApiKey: trailheadApiKey || undefined,
      evaluationStoreUrl: core.getInput("evaluation-store-url") || undefined,
    });

    const ciManifestPath = core.getInput("ci-manifest-path") || "";
    const ciExternalStatusUrl = core.getInput("ci-external-status-url") || "";
    const ciExternalStatusSecret = core.getInput("ci-external-status-secret") || "";
    const gitlabToken = core.getInput("gitlab-token") || "";
    const gitlabProjectId = core.getInput("gitlab-project-id") || "";
    const gitlabApiUrl = core.getInput("gitlab-api-url") || "";
    const circleciToken = core.getInput("circleci-token") || "";
    const circleciProjectSlug = core.getInput("circleci-project-slug") || "";

    const context = github.context;
    const githubToken =
      core.getInput("github-token") || process.env.GITHUB_TOKEN || undefined;
    let { commitSha, prNumber } = resolveEvaluationTarget(context);
    let evaluationPrMetadata: EvaluationPrMetadata | undefined;

    // Resolve on-demand targets before external CI so every check provider
    // queries the same commit as the gate.
    const evaluatePrInput = core.getInput("evaluate-pr").trim();
    const backfillMode = Boolean(evaluatePrInput);
    if (evaluatePrInput) {
      const parsedPr = parseInt(evaluatePrInput, 10);
      if (Number.isNaN(parsedPr) || parsedPr <= 0) {
        throw new Error(
          `evaluate-pr must be a positive PR number; got "${evaluatePrInput}".`,
        );
      }
      if (!githubToken) {
        throw new Error(
          "evaluate-pr requires a github-token to resolve the PR head commit.",
        );
      }
      const octokit = github.getOctokit(githubToken);
      const { data: targetPr } = await octokit.rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: parsedPr,
      });
      prNumber = parsedPr;
      commitSha = targetPr.head.sha;
      evaluationPrMetadata = {
        baseRef: targetPr.base.ref,
        headRef: targetPr.head.ref,
        labels: targetPr.labels.map((label) => label.name),
        authorLogin: targetPr.user?.login,
      };
      core.info(
        `evaluate-pr mode: PR #${parsedPr} (${targetPr.state}) @ ${commitSha.substring(0, 7)} ` +
          `base=${targetPr.base.ref} — backfill/re-evaluation; PR comments, labels and autofix are skipped.`,
      );
    }

    const ciManifest = await resolveCiManifests({
      ciManifestPath: ciManifestPath || undefined,
      ciExternalStatusUrl: ciExternalStatusUrl || undefined,
      ciExternalStatusSecret: ciExternalStatusSecret || undefined,
      commitSha,
      gitlabApiUrl: gitlabApiUrl || undefined,
      gitlabToken: gitlabToken || undefined,
      gitlabProjectId: gitlabProjectId || undefined,
      circleciToken: circleciToken || undefined,
      circleciProjectSlug: circleciProjectSlug || undefined,
    });

    if (ciManifest) {
      core.info(`Loaded CI manifest (${ciManifest.jobs.length} job(s))`);
    } else if (
      ciManifestPath ||
      ciExternalStatusUrl ||
      (gitlabToken && gitlabProjectId) ||
      (circleciToken && circleciProjectSlug)
    ) {
      core.warning("External CI inputs were set but no CI manifest could be resolved");
    }

    const config: TrailheadConfig = {
      apiKey: core.getInput("api-key") || "",
      apiUrl: readEnv("TRAILHEAD_API_URL", "DEPLOYGUARD_API_URL") || "",
      githubToken,
      healthCheckUrls: (core.getInput("health-check-urls") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      riskThreshold: parseInt(core.getInput("risk-threshold") || "70", 10),
      warnThreshold: core.getInput("warn-threshold")
        ? parseInt(core.getInput("warn-threshold"), 10)
        : undefined,
      failMode,
      selfHeal: core.getInput("self-heal") !== "false",
      addRiskLabels: core.getInput("add-risk-labels") !== "false",
      reviewersOnRisk: core.getInput("reviewers-on-risk")
        ? core
            .getInput("reviewers-on-risk")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      webhookUrl: core.getInput("webhook-url") || undefined,
      webhookEvents: (core.getInput("webhook-events") || "warn,block")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      evaluationStoreUrl,
      trailheadApiKey: trailheadApiKey || undefined,
      environment,
      securityGate: core.getInput("security-gate") !== "false",
      gateMode,
      // Tri-state (true / false / undefined) on purpose: an explicit
      // wait-for-checks input wins outright, but leaving it unset must NOT be
      // resolved here against `gateMode` — that's only the raw `gate-mode`
      // action input, which is commonly left unset when a repo picks
      // release-ready mode via .trailhead.yml (gate.mode / schema_version)
      // instead. Resolving the "release-ready -> wait by default" rule here
      // against the unset input silently produced `false`, so evaluateGate
      // skipped waitForChecks entirely and failed not-ready on the first
      // still-in-flight required check — even with wait-timeout-minutes set.
      // gate.ts resolves the effective default once it knows the real
      // (input-or-config) gate mode.
      waitForChecks:
        core.getInput("wait-for-checks") === "true"
          ? true
          : core.getInput("wait-for-checks") === "false"
            ? false
            : undefined,
      waitTimeoutMinutes: core.getInput("wait-timeout-minutes")
        ? parseInt(core.getInput("wait-timeout-minutes"), 10)
        : 30,
      checkName: core.getInput("check-name") || undefined,
      ciManifest,
      ciManifestPath: ciManifestPath || undefined,
      agentBrief,
      submissionGate: core.getInput("submission-gate") === "true",
      disableCloudUpsell: core.getInput("disable-cloud-upsell") === "true",
    };

    if (policyOverride?.changes.riskThreshold !== undefined) {
      config.riskThreshold = policyOverride.changes.riskThreshold;
    }
    if (policyOverride?.changes.warnThreshold !== undefined) {
      config.warnThreshold = policyOverride.changes.warnThreshold;
    }
    if (policyOverride?.changes.failMode !== undefined) {
      config.failMode = policyOverride.changes.failMode;
    }

    if (policyOverride) {
      core.warning(
        `Governed override active (${policyOverride.linkedTicket}) by ${policyOverride.owner}; expires ${policyOverride.expiresAt}.`,
      );
    }

    core.info(`Evaluating deployment gate for ${commitSha.substring(0, 7)}`);

    const evaluation = await evaluateGate(
      config,
      commitSha,
      prNumber,
      evaluationPrMetadata,
    );
    if (policyOverride && !evaluation.policyOverride) {
      evaluation.policyOverride = policyOverride;
    }

    const creditMeterConfig = resolveCreditMeterConfig({
      url:
        core.getInput("credit-meter-url") ||
        readEnv("KOMATIK_CREDIT_METER_URL") ||
        undefined,
      secret:
        core.getInput("credit-meter-secret") ||
        readEnv("KOMATIK_CREDIT_METER_SECRET") ||
        undefined,
      shadow: core.getInput("credit-meter-shadow") !== "false",
      enforce: core.getInput("credit-meter-enforce") === "true",
    });

    if (creditMeterConfig.enabled) {
      try {
        const creditUser = resolveCreditMeterUserFromEnv();
        const creditResult = await meterDeployCheck(
          evaluation,
          creditMeterConfig,
          creditUser,
        );
        evaluation.credit_meter = creditResult;
        if (creditResult.metered && creditResult.shadow) {
          core.info(
            `Credit shadow meter: deploy_check would charge ${creditResult.would_charge ?? "?"} credits`,
          );
        } else if (creditResult.skipped && creditResult.reason === "no_member_identity") {
          core.debug(
            "Credit meter skipped — set TRAILHEAD_CREDIT_USER_ID or TRAILHEAD_CREDIT_USER_EMAIL",
          );
        } else if (
          creditMeterConfig.enforce &&
          creditResult.metered &&
          creditResult.allowed === false
        ) {
          core.warning(
            `Credit meter blocked deliverable (${creditResult.reason ?? "not allowed"}) — balance ${creditResult.balance ?? "?"}`,
          );
        }
      } catch (err) {
        core.warning(`Credit metering failed (non-blocking): ${err}`);
      }
    }

    // Autofix self-heal (ADR-010) — opt-in; dry-run (plan only) unless enabled.
    const autofixFixes = evaluation.remediation?.fixes ?? [];
    if (
      config.githubToken &&
      prNumber &&
      !backfillMode &&
      autofixFixes.some((f) => f.autofix_eligible)
    ) {
      try {
        const autofixEnabled =
          core.getInput("autofix") === "true" || readEnv("TRAILHEAD_AUTOFIX") === "true";
        const prPayload = context.payload.pull_request as
          | {
              head?: { ref?: string; repo?: { full_name?: string } };
              base?: { repo?: { full_name?: string } };
            }
          | undefined;
        const autofixResult = await runGateAutofix({
          client: github.getOctokit(config.githubToken) as unknown as GateAutofixClient,
          fixes: autofixFixes,
          owner: context.repo.owner,
          repo: context.repo.repo,
          evaluationId: evaluation.id,
          headBranch: prPayload?.head?.ref,
          headRepoFullName: prPayload?.head?.repo?.full_name,
          baseRepoFullName: prPayload?.base?.repo?.full_name,
          enabled: autofixEnabled,
        });
        core.setOutput("autofix-json", JSON.stringify(autofixResult));
        if (autofixResult.committed) {
          core.info(
            `Trailhead self-heal committed ${autofixResult.fixCode} → ${autofixResult.commitSha} on ${prPayload?.head?.ref}`,
          );
        } else if (autofixResult.edits?.length) {
          core.info(
            `Trailhead self-heal (dry-run): would fix ${autofixResult.fixCode} (${autofixResult.files?.join(", ")}). Set autofix: true to apply.`,
          );
        } else if (autofixResult.skippedReason) {
          core.debug(`Autofix skipped: ${autofixResult.skippedReason}`);
        }
      } catch (err) {
        core.warning(`Autofix failed (non-blocking): ${err}`);
      }
    }

    // Cross-repo PR opener (ADR-010) — the contract_integrity case a commit on
    // THIS PR can't fix: a dangling consumesApis/dependsOn ref whose declaration
    // belongs in another repo. Opens a declaration PR in the owning repo. Opt-in,
    // dry-run unless enabled, and needs a token with write access to those repos.
    const contractFix = autofixFixes.find(
      (f) => f.code === "submission.contract_integrity",
    );
    if (config.githubToken && prNumber && contractFix && contractFix.files.length > 0) {
      try {
        const repoConfig = await loadRepoConfig(config.githubToken);
        const ci = repoConfig?.submission?.contract_integrity;
        // Owner registry: generated file (api_owners_path) ∪ inline (inline wins).
        const apiOwners: Record<string, string> = {};
        if (ci?.api_owners_path) {
          try {
            Object.assign(apiOwners, loadCatalogOwners(ci.api_owners_path));
          } catch (err) {
            core.debug(`Cross-repo opener: api_owners_path load failed: ${err}`);
          }
        }
        Object.assign(apiOwners, ci?.api_owners ?? {});
        if (Object.keys(apiOwners).length > 0) {
          const openerCfg = ci?.cross_repo_opener;
          // Resolution universe — match what the gate used (known_entities ∪ index).
          const known = new Set<string>(ci?.known_entities ?? []);
          if (ci?.catalog_index_path) {
            try {
              for (const e of loadCatalogIndex(ci.catalog_index_path)) known.add(e);
            } catch (err) {
              core.debug(`Cross-repo opener: catalog index load failed: ${err}`);
            }
          }
          const crossRepoToken =
            core.getInput("cross-repo-token") || readEnv("TRAILHEAD_CROSS_REPO_TOKEN");
          const openerEnabled =
            (openerCfg?.enabled ?? false) &&
            core.getInput("cross-repo-opener") !== "false" &&
            Boolean(crossRepoToken);
          const prPayload = context.payload.pull_request as
            | { head?: { ref?: string }; html_url?: string }
            | undefined;
          const openerResult = await runCrossRepoOpener({
            client: github.getOctokit(
              crossRepoToken || config.githubToken,
            ) as unknown as CrossRepoOpenerClient,
            gatedOwner: context.repo.owner,
            gatedRepo: context.repo.repo,
            headBranch: prPayload?.head?.ref,
            catalogPaths: contractFix.files,
            evaluationId: evaluation.id,
            knownEntities: known,
            apiOwners,
            ownerAllowlist: openerCfg?.owner_allowlist,
            prContext: { number: prNumber, url: prPayload?.html_url },
            enabled: openerEnabled,
          });
          core.setOutput("cross-repo-opener-json", JSON.stringify(openerResult));
          for (const o of openerResult.outcomes) {
            if (o.status === "opened") {
              core.info(
                `Cross-repo opener: declared ${o.entities.join(", ")} → ${o.prUrl} on ${o.owner}/${o.repo}`,
              );
            } else if (o.status === "dry-run") {
              core.info(
                `Cross-repo opener (dry-run): would declare ${o.entities.join(", ")} in ${o.owner}/${o.repo}. Enable cross_repo_opener + supply cross-repo-token to apply.`,
              );
            } else if (o.status === "exists") {
              core.info(
                `Cross-repo opener: declaration PR already open for ${o.owner}/${o.repo} (${o.prUrl})`,
              );
            } else if (o.status === "error") {
              core.warning(`Cross-repo opener error (${o.owner}/${o.repo}): ${o.reason}`);
            }
          }
          for (const u of openerResult.unresolved) {
            core.debug(`Cross-repo opener unresolved: ${u.name} — ${u.reason}`);
          }
          if (openerResult.skippedReason) {
            core.debug(`Cross-repo opener: ${openerResult.skippedReason}`);
          }
        }
      } catch (err) {
        core.warning(`Cross-repo opener failed (non-blocking): ${err}`);
      }
    }

    core.setOutput("health-score", evaluation.healthScore.toString());
    core.setOutput("risk-score", evaluation.riskScore.toString());
    core.setOutput("gate-decision", evaluation.gateDecision);
    core.setOutput(
      "release-ready",
      evaluation.releaseReady !== undefined ? String(evaluation.releaseReady) : "",
    );
    core.setOutput("evaluation-json", JSON.stringify(evaluation));
    if (evaluation.releaseBrief) {
      core.setOutput("release-brief-json", JSON.stringify(evaluation.releaseBrief));
    }
    const verdict = buildGateVerdict(evaluation, {
      trustRuntime: readTrustRuntime(),
      agentId: resolveAgentProvenanceId(evaluation),
    });
    core.setOutput("verdict-json", JSON.stringify(verdict));
    core.setOutput(
      "rollout-readiness-json",
      JSON.stringify(computeRolloutReadiness(evaluation)),
    );
    if (evaluation.reportUrl) {
      core.setOutput("report-url", evaluation.reportUrl);
    }

    let report = formatGateReport(evaluation, config.riskThreshold);

    let securityReport = "";
    if (config.securityGate !== false && config.githubToken) {
      try {
        const alerts = await fetchCodeScanningAlerts(config.githubToken, undefined, {
          changedFiles: evaluation.files,
        });
        if (alerts.total > 0) {
          core.setOutput("security-alerts-json", JSON.stringify(alerts));
          securityReport = formatSecuritySection(alerts);
        }
      } catch (err) {
        core.debug(`Security alerts fetch failed (non-blocking): ${err}`);
      }
    }

    let doraReport = "";
    const doraEnabled = core.getInput("dora-metrics") === "true";
    if (doraEnabled && config.githubToken) {
      try {
        const doraEnvironment =
          core.getInput("dora-environment") || config.environment || undefined;
        const doraMetrics = await computeDoraMetrics(config.githubToken, {
          windowDays: 30,
          environment: doraEnvironment,
        });

        const dfLabel = formatDeploymentFrequencyForOutput(
          doraMetrics.deploymentFrequency.deploysPerWeek,
        );

        const ltLabel =
          doraMetrics.leadTimeToChange.medianHours >= 24
            ? `${Math.round((doraMetrics.leadTimeToChange.medianHours / 24) * 10) / 10} days`
            : `${doraMetrics.leadTimeToChange.medianHours} hours`;

        const fdrtLabel =
          doraMetrics.failedDeployRecoveryTime.incidentCount === 0
            ? "n/a"
            : doraMetrics.failedDeployRecoveryTime.medianHours >= 24
              ? `${Math.round((doraMetrics.failedDeployRecoveryTime.medianHours / 24) * 10) / 10} days`
              : `${doraMetrics.failedDeployRecoveryTime.medianHours} hours`;

        core.setOutput("dora-deployment-frequency", dfLabel);
        core.setOutput(
          "dora-change-failure-rate",
          `${doraMetrics.changeFailureRate.percentage}%`,
        );
        core.setOutput("dora-lead-time", ltLabel);
        core.setOutput("dora-fdrt", fdrtLabel);
        core.setOutput("dora-rework-rate", `${doraMetrics.changeReworkRate.percentage}%`);
        core.setOutput("dora-rating", doraMetrics.overallRating.toUpperCase());
        core.setOutput("dora-json", JSON.stringify(doraMetrics));

        doraReport = formatDoraReport(doraMetrics);
      } catch (err) {
        core.debug(`DORA metrics computation failed (non-blocking): ${err}`);
      }
    }

    const otelEndpoint =
      core.getInput("otel-endpoint") || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "";
    if (otelEndpoint) {
      const otelHeaders =
        core.getInput("otel-headers") || process.env.OTEL_EXPORTER_OTLP_HEADERS || "";
      try {
        await exportOtelSpan(evaluation, otelEndpoint, otelHeaders);
      } catch (err) {
        core.debug(`OTel export failed (non-blocking): ${err}`);
      }
    }

    const reportParts = [report];
    if (securityReport) {
      reportParts.push(wrapCollapsibleSection("Security Alerts", securityReport));
    }
    if (doraReport) {
      reportParts.push(wrapCollapsibleSection("DORA-5 Metrics", doraReport));
    }
    let fullReport = reportParts.join("\n---\n\n");

    let cloudQuotaExceeded = false;
    let cloudSuspended = false;
    let cloudHardCapped = false;

    const checkName =
      evaluation.resolvedCheckName ??
      resolveCheckName(evaluation.gateMode ?? "risk-only", config.checkName);

    let checkPublication: Awaited<ReturnType<typeof createCheckRun>> | undefined;
    if (config.githubToken && !backfillMode) {
      checkPublication = await createCheckRun(
        evaluation,
        fullReport,
        config.githubToken,
        checkName,
      );
    }

    if (evaluation.releaseBrief) {
      const eventName = context.eventName || "unknown";
      const headSha = evaluation.commitSha;
      const publicationMessage = checkPublication
        ? checkPublication.published
          ? `Published custom check \`${checkName}\` on \`${headSha}\` from \`${eventName}\`. ` +
            "Branch protection must require this custom check from the token's " +
            "publishing GitHub App, not the workflow job name. For GITHUB_TOKEN, " +
            "that source is GitHub Actions."
          : checkPublication.superseded
            ? `Did not publish custom check \`${checkName}\` on \`${headSha}\`: run ` +
              `${checkPublication.supersededByRunId} already published a newer evaluation ` +
              "for this PR revision. No action needed."
            : `Could not publish custom check \`${checkName}\` on \`${headSha}\` from \`${eventName}\`. ` +
              "This evaluation cannot satisfy branch protection. " +
              customCheckRecoveryGuidance()
        : backfillMode
          ? `Backfill mode did not publish custom check \`${checkName}\` on \`${headSha}\`. ` +
            "Run the normal PR workflow to satisfy branch protection."
          : `No GitHub token was available to publish custom check \`${checkName}\` on \`${headSha}\`. ` +
            customCheckRecoveryGuidance(true);
      evaluation.releaseBrief.requiredCheck = {
        published: checkPublication?.published ?? false,
        reportRefreshed: checkPublication?.published ?? false,
        name: checkName,
        headSha,
        eventName,
        message: publicationMessage,
        ...(checkPublication?.superseded ? { superseded: true } : {}),
      };

      const updatedReport = formatGateReport(evaluation, config.riskThreshold);
      fullReport = replaceGateReport(fullReport, report, updatedReport);
      report = updatedReport;
    }

    let checkReportRefreshed = false;
    if (checkPublication?.published && config.githubToken) {
      checkReportRefreshed = await refreshCheckReport(
        checkPublication,
        evaluation,
        fullReport,
        config.githubToken,
        2,
      );
      if (!checkReportRefreshed && evaluation.releaseBrief?.requiredCheck) {
        evaluation.releaseBrief.requiredCheck.reportRefreshed = false;
        evaluation.releaseBrief.requiredCheck.message = checkReportRefreshFailureMessage(
          checkName,
          evaluation.commitSha,
          context.eventName || "unknown",
        );
        const refreshFailureReport = formatGateReport(evaluation, config.riskThreshold);
        fullReport = replaceGateReport(fullReport, report, refreshFailureReport);
        report = refreshFailureReport;
      }
    }
    const checkReportBeforePersistence = fullReport;

    // Persist only after the required-check publication record is attached, so
    // the store, output, webhook, summary and PR comment all carry the same brief.
    if (config.evaluationStoreUrl) {
      const storeSecretInput = core.getInput("evaluation-store-secret");
      if (storeSecretInput && !process.env.EVALUATION_STORE_SECRET) {
        process.env.EVALUATION_STORE_SECRET = storeSecretInput;
      }
      if (config.trailheadApiKey && !process.env.EVALUATION_STORE_SECRET) {
        process.env.EVALUATION_STORE_SECRET = config.trailheadApiKey;
      }
      const storeRetries = parseEvaluationStoreRetries(
        core.getInput("evaluation-store-retries") || "",
      );
      const storeOutcome = await storeEvaluationDetailed(
        config.evaluationStoreUrl,
        evaluation,
        { maxRetries: storeRetries },
      );
      evaluation.storePersisted = storeOutcome.stored;
      cloudQuotaExceeded = storeOutcome.quotaExceeded;
      cloudSuspended = storeOutcome.suspended;
      cloudHardCapped = storeOutcome.hardCapped;
      // The cloud-upsell footer below already explains suspended/hard-capped
      // state plainly with a link — don't also prepend the generic warning.
      if (!storeOutcome.stored && !cloudSuspended && !cloudHardCapped) {
        const persistWarning =
          "> ⚠️ **Evaluation not persisted — dashboard incomplete.**";
        fullReport = `${persistWarning}\n\n${fullReport}`;
      }
    }

    const cloudFooterLine = buildCloudFooterLine({
      // BYOS self-hosters (evaluation-store-url without a cloud key) DO
      // persist evaluations — the "wasn't persisted" upsell must only fire
      // in truly local-only mode.
      hasCloudKey: Boolean(config.trailheadApiKey || config.evaluationStoreUrl),
      disableUpsell: config.disableCloudUpsell ?? false,
      quotaExceeded: cloudQuotaExceeded,
      suspended: cloudSuspended,
      hardCapped: cloudHardCapped,
    });
    if (cloudFooterLine) {
      fullReport = `${fullReport}\n\n${cloudFooterLine}`;
    }

    if (
      checkPublication?.published &&
      config.githubToken &&
      checkReportRefreshed &&
      fullReport !== checkReportBeforePersistence
    ) {
      await refreshCheckReport(
        checkPublication,
        evaluation,
        fullReport,
        config.githubToken,
        1,
      );
    }

    // These outputs were first emitted before publication/persistence; replace
    // them with the final D3 lineage and store record.
    core.setOutput("evaluation-json", JSON.stringify(evaluation));
    if (evaluation.releaseBrief) {
      core.setOutput("release-brief-json", JSON.stringify(evaluation.releaseBrief));
    }

    await core.summary.addRaw(fullReport).write();

    if (config.githubToken && !backfillMode) {
      if (prNumber) {
        await postPrComment(fullReport, prNumber, config.githubToken);
      }
      if (prNumber && config.addRiskLabels && evaluation.gateMode !== "advisory") {
        await managePrLabels(prNumber, evaluation.gateDecision, config.githubToken);
      }
    }

    if (config.webhookUrl) {
      await deliverWebhooks(config.webhookUrl, evaluation, config.webhookEvents, {
        riskThreshold: config.riskThreshold,
        warnThreshold: config.warnThreshold,
      });
    }

    const blockMerge = shouldBlockMerge(evaluation);

    if (!blockMerge) {
      if (evaluation.gateDecision === "warn") {
        core.warning(fullReport);
        if (
          config.githubToken &&
          prNumber &&
          !backfillMode &&
          config.reviewersOnRisk.length > 0
        ) {
          await requestHighRiskReviewers(
            prNumber,
            config.reviewersOnRisk,
            config.githubToken,
          );
        }
        if (config.selfHeal && prNumber && !backfillMode) {
          const repairs = await runSelfHeal(config, prNumber);
          if (repairs.length > 0) {
            core.info(
              `Self-heal attempted ${repairs.length} repair(s): ` +
                `${repairs.filter((r) => r.success).length} succeeded`,
            );
          }
        }
      } else {
        core.info(fullReport);
      }
      return;
    }

    if (
      config.githubToken &&
      prNumber &&
      !backfillMode &&
      config.reviewersOnRisk.length > 0
    ) {
      await requestHighRiskReviewers(
        prNumber,
        config.reviewersOnRisk,
        config.githubToken,
      );
    }
    if (config.selfHeal && prNumber && !backfillMode) {
      const repairs = await runSelfHeal(config, prNumber);
      const successes = repairs.filter((r) => r.success);
      if (successes.length > 0) {
        core.info(
          `Self-heal repaired ${successes.length}/${repairs.length} test failure(s) — ` +
            `review suggestions in PR comments`,
        );
      }
    }

    const blockReason =
      evaluation.gateMode === "release-ready"
        ? `Release not ready: ${(evaluation.releaseReadyReasons ?? []).join("; ") || "composite check failed"}`
        : `Deployment blocked: health=${evaluation.healthScore}, ` +
          `risk=${evaluation.riskScore} (threshold: ${config.riskThreshold})`;
    core.setFailed(blockReason);
  } catch (error) {
    const environment = core.getInput("environment") || undefined;
    const failMode = resolveEffectiveFailMode(environment);

    if (error instanceof PolicyOverrideError) {
      // An unusable override is still a run that could not evaluate — ADR-011 §1
      // owes the PR a brief here too, with the validation message as the reason.
      // The availability stance is a repo/environment contract, not a property of
      // which error was thrown: an invalid override in a fail-open repo publishes
      // the same fail-open cannot-evaluate check as any other failure. (The job
      // itself still fails via setFailed below either way.)
      await postCannotEvaluateBrief(error, failMode);
      core.setFailed(`Invalid policy override: ${error.message}`);
      return;
    }

    // ADR-011 §1: "silence is a bug." A run that could not evaluate still owes the
    // PR a brief. Best-effort — a posting failure must never mask the real error.
    await postCannotEvaluateBrief(error, failMode);

    if (failMode === "open") {
      core.warning(
        `Trailhead evaluation failed — proceeding with deployment (fail-open). Error: ${error}`,
      );
    } else {
      core.setFailed(
        `Trailhead evaluation failed — blocking deployment (fail-closed). Error: ${error}`,
      );
    }
  }
}

run();
