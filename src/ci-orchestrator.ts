import * as core from "@actions/core";
import * as github from "@actions/github";
import type { CiCheck, CiSummary, ContextCiConfig } from "./types.js";
import {
  DEFAULT_SELF_CHECK_NAMES,
  evaluateRequiredChecks,
  normalizeCheckRuns,
  type RawCheckRun,
} from "./ci-core.js";

export {
  classifyCheck,
  checkNameMatches,
  evaluateRequiredChecks,
  formatCiStatusIcon,
  normalizeCheckRuns,
  DEFAULT_SELF_CHECK_NAMES,
} from "./ci-core.js";
export type { RawCheckRun } from "./ci-core.js";

export interface FetchCheckRunsOptions {
  owner: string;
  repo: string;
  headSha: string;
  excludeCheckNames?: string[];
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
