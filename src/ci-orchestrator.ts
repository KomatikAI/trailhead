import * as core from "@actions/core";
import * as github from "@actions/github";
import type { CiManifest } from "./ci-manifest.js";
import type {
  CiCheck,
  CiSummary,
  ContextCiConfig,
  InputRelevanceEntry,
} from "./types.js";
import {
  DEFAULT_SELF_CHECK_NAMES,
  evaluateRequiredChecks,
  normalizeCheckRuns,
  type RawCheckRun,
} from "./ci-core.js";
import { applyInputRelevance } from "./input-relevance.js";

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
  manifest?: CiManifest | null;
  /**
   * ADR-011 §2 policy. A repo can declare blocking checks purely through
   * `input_relevance`, with no `ci.required_checks` at all — every check then
   * carries `required: false`, so the raw `evaluateRequiredChecks` summary
   * alone (pendingCount over the *required* set) is not what should decide
   * whether this loop keeps polling. Passed through so the loop's own
   * exit condition matches what the caller will ultimately treat as
   * blocking, not just what `ciConfig.required_checks` names.
   */
  inputRelevance?: InputRelevanceEntry[];
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
    manifest,
    inputRelevance = [],
  } = options;

  const deadline = Date.now() + timeoutMinutes * 60 * 1000;

  while (true) {
    const allChecks = await fetchCheckRuns(octokit, {
      owner,
      repo,
      headSha,
      excludeCheckNames,
    });
    const summary = applyInputRelevance(
      evaluateRequiredChecks(allChecks, ciConfig, manifest),
      inputRelevance,
    );

    // Pending blocking checks (ADR-011 §2 disposition — required_checks when
    // no input_relevance policy matches, but never required_checks alone)
    // wait out the timeout; a genuine failure (or missing-required-with-
    // fail-policy, which evaluateRequiredChecks already folds into
    // failedCount) resolves the outcome immediately — more polling cannot
    // turn an already-failed blocking check back into a pass, so waiting out
    // the remaining timeout would only delay reporting it.
    if (summary.pendingCount === 0 || summary.failedCount > 0 || Date.now() >= deadline) {
      if (summary.pendingCount > 0 && summary.failedCount === 0) {
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
