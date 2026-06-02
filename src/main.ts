import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  evaluateGate,
  formatGateReport,
  postPrComment,
  createCheckRun,
  managePrLabels,
  requestHighRiskReviewers,
  shouldBlockMerge,
  resolveCheckName,
  wrapCollapsibleSection,
} from "./gate.js";
import { deliverWebhooks, storeEvaluation } from "./notify.js";
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
import { loadCatalogIndex } from "./catalog-index.js";
import type { TrailheadConfig, TestRepairResult, PolicyOverrideAudit } from "./types.js";

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
    const ciManifest = await resolveCiManifests({
      ciManifestPath: ciManifestPath || undefined,
      ciExternalStatusUrl: ciExternalStatusUrl || undefined,
      ciExternalStatusSecret: ciExternalStatusSecret || undefined,
      commitSha: context.sha,
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
      githubToken: core.getInput("github-token") || process.env.GITHUB_TOKEN || undefined,
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
      waitForChecks:
        core.getInput("wait-for-checks") === "true" ||
        (gateMode === "release-ready" && core.getInput("wait-for-checks") !== "false"),
      waitTimeoutMinutes: core.getInput("wait-timeout-minutes")
        ? parseInt(core.getInput("wait-timeout-minutes"), 10)
        : 30,
      checkName: core.getInput("check-name") || undefined,
      ciManifest,
      ciManifestPath: ciManifestPath || undefined,
      agentBrief,
      submissionGate: core.getInput("submission-gate") === "true",
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

    const commitSha = context.sha;
    const prNumber = context.payload.pull_request?.number;

    core.info(`Evaluating deployment gate for ${commitSha.substring(0, 7)}`);

    const evaluation = await evaluateGate(config, commitSha, prNumber);
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
    if (config.githubToken && prNumber && autofixFixes.some((f) => f.autofix_eligible)) {
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
        const apiOwners = ci?.api_owners ?? {};
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

    const report = formatGateReport(evaluation, config.riskThreshold);

    let securityReport = "";
    if (config.securityGate !== false && config.githubToken) {
      try {
        const alerts = await fetchCodeScanningAlerts(config.githubToken);
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
      const stored = await storeEvaluation(config.evaluationStoreUrl, evaluation, {
        maxRetries: storeRetries,
      });
      evaluation.storePersisted = stored;
      if (!stored) {
        const persistWarning =
          "> ⚠️ **Evaluation not persisted — dashboard incomplete.**";
        fullReport = `${persistWarning}\n\n${fullReport}`;
      }
    }

    await core.summary.addRaw(fullReport).write();

    const checkName = resolveCheckName(
      evaluation.gateMode ?? "risk-only",
      config.checkName,
    );

    if (config.githubToken) {
      if (prNumber) {
        await postPrComment(fullReport, prNumber, config.githubToken);
      }
      await createCheckRun(evaluation, fullReport, config.githubToken, checkName);
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
        if (config.githubToken && prNumber && config.reviewersOnRisk.length > 0) {
          await requestHighRiskReviewers(
            prNumber,
            config.reviewersOnRisk,
            config.githubToken,
          );
        }
        if (config.selfHeal && prNumber) {
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

    if (config.githubToken && prNumber && config.reviewersOnRisk.length > 0) {
      await requestHighRiskReviewers(
        prNumber,
        config.reviewersOnRisk,
        config.githubToken,
      );
    }
    if (config.selfHeal && prNumber) {
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
    if (error instanceof PolicyOverrideError) {
      core.setFailed(`Invalid policy override: ${error.message}`);
      return;
    }

    const environment = core.getInput("environment") || undefined;
    const failMode = resolveFailMode(core.getInput("fail-mode"), environment);
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
