import * as core from "@actions/core";
import * as github from "@actions/github";
import type { CiCheck, CiCheckStatusEnum, CiSummary, ContextCiConfig } from "./types.js";

const DEFAULT_SELF_CHECK_NAMES = ["Trailhead", "Trailhead — Release Ready"];

export interface FetchCheckRunsOptions {
  owner: string;
  repo: string;
  headSha: string;
  excludeCheckNames?: string[];
}

export interface RawCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string | null;
  details_url?: string | null;
}

/**
 * Map GitHub check conclusion/status to Trailhead CI status (ADR-009).
 */
export function classifyCheck(
  status: string,
  conclusion: string | null,
): CiCheckStatusEnum {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "pass";
      case "skipped":
      case "neutral":
        return "skip";
      case "failure":
      case "timed_out":
      case "action_required":
      case "cancelled":
        return "fail";
      default:
        return "pending";
    }
  }
  if (status === "in_progress" || status === "queued" || status === "pending") {
    return "pending";
  }
  return "pending";
}

function isSelfCheck(name: string, excludeNames: string[]): boolean {
  const lower = name.toLowerCase();
  return excludeNames.some((n) => n.toLowerCase() === lower);
}

function checkNameMatches(configured: string, actual: string): boolean {
  if (configured === actual) return true;
  if (configured.toLowerCase() === actual.toLowerCase()) return true;
  return actual.toLowerCase().startsWith(configured.toLowerCase());
}

export function normalizeCheckRuns(
  runs: RawCheckRun[],
  excludeCheckNames: string[] = DEFAULT_SELF_CHECK_NAMES,
): CiCheck[] {
  return runs
    .filter((r) => !isSelfCheck(r.name, excludeCheckNames))
    .map((r) => ({
      name: r.name,
      status: classifyCheck(r.status, r.conclusion),
      conclusion: r.conclusion ?? undefined,
      detailsUrl: r.details_url ?? r.html_url ?? undefined,
      required: false,
    }));
}

export async function fetchCheckRuns(
  octokit: ReturnType<typeof github.getOctokit>,
  options: FetchCheckRunsOptions,
): Promise<CiCheck[]> {
  const { owner, repo, headSha, excludeCheckNames = DEFAULT_SELF_CHECK_NAMES } = options;

  const runs: RawCheckRun[] = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      per_page: 100,
      page,
    });

    for (const check of data.check_runs) {
      runs.push({
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        html_url: check.html_url,
        details_url: check.details_url,
      });
    }

    if (data.check_runs.length < 100) break;
    page += 1;
  }

  return normalizeCheckRuns(runs, excludeCheckNames);
}

export function evaluateRequiredChecks(
  allChecks: CiCheck[],
  ciConfig: ContextCiConfig,
): CiSummary {
  const requiredNames = ciConfig.required_checks;
  const optionalNames = ciConfig.optional_checks;
  const missingPolicy = ciConfig.missing_required;

  const evaluated: CiCheck[] = [];
  const seen = new Set<string>();

  for (const reqName of requiredNames) {
    const match = allChecks.find((c) => checkNameMatches(reqName, c.name));
    if (match) {
      evaluated.push({ ...match, name: reqName, required: true });
      seen.add(match.name);
    } else {
      evaluated.push({
        name: reqName,
        status: missingPolicy === "skip" ? "skip" : "missing",
        required: true,
      });
    }
  }

  for (const optName of optionalNames) {
    const match = allChecks.find((c) => checkNameMatches(optName, c.name));
    if (match) {
      evaluated.push({ ...match, name: optName, required: false });
      seen.add(match.name);
    } else {
      evaluated.push({
        name: optName,
        status: "missing",
        required: false,
      });
    }
  }

  for (const check of allChecks) {
    if (!seen.has(check.name)) {
      evaluated.push({ ...check, required: false });
    }
  }

  const requiredChecks = evaluated.filter((c) => c.required);
  const pendingCount = requiredChecks.filter((c) => c.status === "pending").length;
  const failedCount = requiredChecks.filter(
    (c) => c.status === "fail" || c.status === "missing" || c.status === "stale",
  ).length;
  const missingCount = requiredChecks.filter((c) => c.status === "missing").length;
  const allRequiredPassed =
    requiredNames.length === 0 ||
    requiredChecks.every((c) => c.status === "pass" || c.status === "skip");

  return {
    checks: evaluated,
    allRequiredPassed,
    pendingCount,
    failedCount,
    missingCount,
  };
}

export interface WaitForChecksOptions {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  headSha: string;
  ciConfig: ContextCiConfig;
  excludeCheckNames?: string[];
  timeoutMinutes?: number;
  pollIntervalSeconds?: number;
}

export async function waitForChecks(options: WaitForChecksOptions): Promise<CiSummary> {
  const {
    octokit,
    owner,
    repo,
    headSha,
    ciConfig,
    excludeCheckNames,
    timeoutMinutes = 30,
    pollIntervalSeconds = 15,
  } = options;

  const deadline = Date.now() + timeoutMinutes * 60 * 1000;

  while (true) {
    const allChecks = await fetchCheckRuns(octokit, {
      owner,
      repo,
      headSha,
      excludeCheckNames,
    });
    const summary = evaluateRequiredChecks(allChecks, ciConfig);

    if (summary.pendingCount === 0 || Date.now() >= deadline) {
      if (summary.pendingCount > 0) {
        core.warning(
          `CI wait timed out after ${timeoutMinutes}m with ${summary.pendingCount} check(s) still pending`,
        );
      }
      return summary;
    }

    core.info(
      `Waiting for ${summary.pendingCount} CI check(s) — polling again in ${pollIntervalSeconds}s`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollIntervalSeconds * 1000));
  }
}

export function formatCiStatusIcon(status: CiCheckStatusEnum): string {
  switch (status) {
    case "pass":
      return "✅";
    case "fail":
      return "❌";
    case "skip":
      return "⏭️";
    case "pending":
      return "⏳";
    case "stale":
      return "⚠️";
    case "missing":
      return "❓";
    default: {
      const _exhaustive: never = status;
      return "•";
    }
  }
}
