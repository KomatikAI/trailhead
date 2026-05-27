import * as core from "@actions/core";
import * as github from "@actions/github";

// ---------------------------------------------------------------------------
// DORA rating bands (per dora.dev benchmarks)
// ---------------------------------------------------------------------------

export type DoraRating = "elite" | "high" | "medium" | "low";

export interface DoraMetrics {
  deploymentFrequency: {
    deploysPerWeek: number;
    rating: DoraRating;
    window: number;
  };
  changeFailureRate: {
    percentage: number;
    failures: number;
    total: number;
    rating: DoraRating;
    window: number;
  };
  leadTimeToChange: {
    medianHours: number;
    rating: DoraRating;
    prCount: number;
  };
  failedDeployRecoveryTime: {
    medianHours: number;
    rating: DoraRating;
    incidentCount: number;
  };
  changeReworkRate: {
    percentage: number;
    reworkPrs: number;
    total: number;
    rating: DoraRating;
  };
  overallRating: DoraRating;
  environment?: string;
  service?: string;
}

function rateDeploymentFrequency(deploysPerWeek: number): DoraRating {
  if (deploysPerWeek >= 7) return "elite";
  if (deploysPerWeek >= 1) return "high";
  if (deploysPerWeek >= 1 / 4) return "medium";
  return "low";
}

function rateChangeFailureRate(percentage: number): DoraRating {
  if (percentage <= 5) return "elite";
  if (percentage <= 10) return "high";
  if (percentage <= 15) return "medium";
  return "low";
}

function rateLeadTime(medianHours: number): DoraRating {
  if (medianHours <= 24) return "elite";
  if (medianHours <= 168) return "high";
  if (medianHours <= 720) return "medium";
  return "low";
}

function rateFDRT(medianHours: number): DoraRating {
  if (medianHours <= 1) return "elite";
  if (medianHours <= 24) return "high";
  if (medianHours <= 168) return "medium";
  return "low";
}

function rateReworkRate(percentage: number): DoraRating {
  if (percentage <= 5) return "elite";
  if (percentage <= 10) return "high";
  if (percentage <= 20) return "medium";
  return "low";
}

function overallDoraRating(
  metrics: Omit<DoraMetrics, "overallRating" | "environment" | "service">,
): DoraRating {
  const ratings = [
    metrics.deploymentFrequency.rating,
    metrics.changeFailureRate.rating,
    metrics.leadTimeToChange.rating,
    metrics.failedDeployRecoveryTime.rating,
    metrics.changeReworkRate.rating,
  ];
  const order: DoraRating[] = ["elite", "high", "medium", "low"];
  const worst = ratings.reduce(
    (acc, r) => (order.indexOf(r) > order.indexOf(acc) ? r : acc),
    "elite" as DoraRating,
  );
  const best = ratings.reduce(
    (acc, r) => (order.indexOf(r) < order.indexOf(acc) ? r : acc),
    "low" as DoraRating,
  );
  if (worst === best) return worst;
  const midIndex = Math.round(
    ratings.reduce((sum, r) => sum + order.indexOf(r), 0) / ratings.length,
  );
  return order[Math.min(midIndex, order.length - 1)];
}

export interface DeployEvent {
  outcome: string;
  deployedAt: string;
}

const FAILED_DEPLOY_OUTCOMES = new Set(["failure", "rollback", "error"]);
const SUCCESS_DEPLOY_OUTCOMES = new Set(["success"]);

function repoFullName(): string {
  const { owner, repo } = github.context.repo;
  return `${owner}/${repo}`;
}

function environmentCandidates(environment?: string): string[] {
  const base = environment ?? "production";
  const candidates = [base];
  if (base.toLowerCase() === "production") {
    candidates.push("Production");
  } else if (base === "Production") {
    candidates.push("production");
  }
  return [...new Set(candidates)];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : Math.round(sorted[mid] * 10) / 10;
}

export function computeDeploymentFrequencyFromDeployEvents(
  events: DeployEvent[],
  windowDays: number,
): DoraMetrics["deploymentFrequency"] {
  const successes = events.filter((event) =>
    SUCCESS_DEPLOY_OUTCOMES.has(event.outcome),
  ).length;
  const weeks = windowDays / 7;
  const deploysPerWeek = weeks > 0 ? Math.round((successes / weeks) * 100) / 100 : 0;
  return {
    deploysPerWeek,
    rating: rateDeploymentFrequency(deploysPerWeek),
    window: windowDays,
  };
}

export function computeFdrtFromDeployEvents(
  events: DeployEvent[],
): DoraMetrics["failedDeployRecoveryTime"] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.deployedAt).getTime() - new Date(b.deployedAt).getTime(),
  );
  const recoveryTimesHours: number[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (!FAILED_DEPLOY_OUTCOMES.has(sorted[i].outcome)) continue;

    const failureTime = new Date(sorted[i].deployedAt).getTime();
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (!SUCCESS_DEPLOY_OUTCOMES.has(sorted[j].outcome)) continue;
      recoveryTimesHours.push(
        Math.max(
          0,
          (new Date(sorted[j].deployedAt).getTime() - failureTime) / (1000 * 60 * 60),
        ),
      );
      break;
    }
  }

  if (recoveryTimesHours.length === 0) {
    return { medianHours: 0, rating: "elite", incidentCount: 0 };
  }

  const medianHours = median(recoveryTimesHours);
  return {
    medianHours,
    rating: rateFDRT(medianHours),
    incidentCount: recoveryTimesHours.length,
  };
}

async function fetchDeployEventsFromStore(
  windowDays: number,
): Promise<DeployEvent[] | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const repoId = encodeURIComponent(repoFullName());
  const url =
    `${supabaseUrl}/rest/v1/trailhead_evaluations` +
    `?select=deploy_outcome,deployed_at` +
    `&repo_id=eq.${repoId}` +
    `&deploy_outcome=neq.null` +
    `&deployed_at=gte.${encodeURIComponent(since)}` +
    `&order=deployed_at.desc` +
    `&limit=200`;

  try {
    const response = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const rows = (await response.json()) as Array<{
      deploy_outcome: string;
      deployed_at: string;
    }>;

    return rows.map((row) => ({
      outcome: row.deploy_outcome,
      deployedAt: row.deployed_at,
    }));
  } catch {
    return null;
  }
}

async function loadDeploymentsInWindow(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  since: string,
  environment?: string,
): Promise<Array<{ id: number; created_at: string }>> {
  for (const env of environmentCandidates(environment)) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/deployments", {
      owner,
      repo,
      environment: env,
      per_page: 100,
    });

    const deploymentsInWindow = (
      data as Array<{ id: number; created_at: string }>
    ).filter((deployment) => new Date(deployment.created_at).toISOString() >= since);

    if (deploymentsInWindow.length > 0) {
      return deploymentsInWindow;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Deployment Frequency
// ---------------------------------------------------------------------------

async function computeDeploymentFrequency(
  token: string,
  windowDays: number,
  environment?: string,
): Promise<DoraMetrics["deploymentFrequency"]> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    if (environment) {
      const deploymentsInWindow = await loadDeploymentsInWindow(
        octokit,
        owner,
        repo,
        since,
        environment,
      );

      const weeks = windowDays / 7;
      const deploysPerWeek =
        weeks > 0 ? Math.round((deploymentsInWindow.length / weeks) * 100) / 100 : 0;

      if (deploysPerWeek > 0) {
        return {
          deploysPerWeek,
          rating: rateDeploymentFrequency(deploysPerWeek),
          window: windowDays,
        };
      }
    } else {
      const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        status: "success",
        created: `>=${since}`,
        per_page: 100,
        event: "push",
      });

      const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
      const defaultBranch = repoInfo.default_branch;

      const deployRuns = data.workflow_runs.filter(
        (r) => r.head_branch === defaultBranch,
      );

      const deployCount = deployRuns.length;
      const weeks = windowDays / 7;
      const deploysPerWeek =
        weeks > 0 ? Math.round((deployCount / weeks) * 100) / 100 : 0;

      if (deploysPerWeek > 0) {
        return {
          deploysPerWeek,
          rating: rateDeploymentFrequency(deploysPerWeek),
          window: windowDays,
        };
      }
    }

    const storeEvents = await fetchDeployEventsFromStore(windowDays);
    if (storeEvents && storeEvents.length > 0) {
      const fromStore = computeDeploymentFrequencyFromDeployEvents(
        storeEvents,
        windowDays,
      );
      if (fromStore.deploysPerWeek > 0) {
        core.info(
          `DORA deployment frequency: using ${storeEvents.length} deploy event(s) from evaluation store`,
        );
        return fromStore;
      }
    }

    return { deploysPerWeek: 0, rating: "low", window: windowDays };
  } catch (error) {
    core.warning(
      `DORA deployment frequency: GitHub Actions API failed (${error}). ` +
        `Grant actions:read to GITHUB_TOKEN, or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for evaluation-store fallback.`,
    );
    const storeEvents = await fetchDeployEventsFromStore(windowDays);
    if (storeEvents && storeEvents.length > 0) {
      return computeDeploymentFrequencyFromDeployEvents(storeEvents, windowDays);
    }
    return { deploysPerWeek: 0, rating: "low", window: windowDays };
  }
}

// ---------------------------------------------------------------------------
// Change Failure Rate
// ---------------------------------------------------------------------------

const FAILURE_PATTERNS = [
  /\brevert\b/i,
  /\brollback\b/i,
  /\bhotfix\b/i,
  /\bfix.*prod/i,
  /\bemergency\b/i,
  /\bincident\b/i,
];

async function computeChangeFailureRate(
  token: string,
  windowDays: number,
  servicePaths?: string[],
): Promise<DoraMetrics["changeFailureRate"]> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const merged = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    });

    let mergedInWindow = merged.data.filter(
      (pr) => pr.merged_at && new Date(pr.merged_at).toISOString() >= since,
    );

    if (servicePaths && servicePaths.length > 0) {
      mergedInWindow = await filterPrsByServicePaths(
        octokit,
        owner,
        repo,
        mergedInWindow,
        servicePaths,
      );
    }

    const total = mergedInWindow.length;
    if (total === 0) {
      return {
        percentage: 0,
        failures: 0,
        total: 0,
        rating: "elite",
        window: windowDays,
      };
    }

    const failures = mergedInWindow.filter((pr) => {
      const text = `${pr.title} ${pr.body ?? ""}`;
      return FAILURE_PATTERNS.some((p) => p.test(text));
    }).length;

    const percentage = Math.round((failures / total) * 1000) / 10;

    return {
      percentage,
      failures,
      total,
      rating: rateChangeFailureRate(percentage),
      window: windowDays,
    };
  } catch (error) {
    core.debug(`DORA change failure rate failed: ${error}`);
    return {
      percentage: 0,
      failures: 0,
      total: 0,
      rating: "low",
      window: windowDays,
    };
  }
}

// ---------------------------------------------------------------------------
// Lead Time to Change
// ---------------------------------------------------------------------------

async function computeLeadTimeToChange(
  token: string,
  windowDays: number,
  servicePaths?: string[],
): Promise<DoraMetrics["leadTimeToChange"]> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 50,
    });

    let mergedInWindow = prs.filter(
      (pr) => pr.merged_at && new Date(pr.merged_at).toISOString() >= since,
    );

    if (servicePaths && servicePaths.length > 0) {
      mergedInWindow = await filterPrsByServicePaths(
        octokit,
        owner,
        repo,
        mergedInWindow,
        servicePaths,
      );
    }

    if (mergedInWindow.length === 0) {
      return { medianHours: 0, rating: "elite", prCount: 0 };
    }

    const leadTimesHours: number[] = [];
    const sampleSize = Math.min(mergedInWindow.length, 20);

    for (const pr of mergedInWindow.slice(0, sampleSize)) {
      try {
        const { data: commits } = await octokit.rest.pulls.listCommits({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 1,
        });

        if (commits.length > 0 && pr.merged_at) {
          const firstCommitDate =
            commits[0].commit.committer?.date ?? commits[0].commit.author?.date;
          if (firstCommitDate) {
            const leadMs =
              new Date(pr.merged_at).getTime() - new Date(firstCommitDate).getTime();
            leadTimesHours.push(Math.max(0, leadMs / (1000 * 60 * 60)));
          }
        }
      } catch {
        // skip PRs we can't fetch commits for
      }
    }

    if (leadTimesHours.length === 0) {
      return { medianHours: 0, rating: "elite", prCount: 0 };
    }

    leadTimesHours.sort((a, b) => a - b);
    const mid = Math.floor(leadTimesHours.length / 2);
    const medianHours =
      leadTimesHours.length % 2 === 0
        ? Math.round(((leadTimesHours[mid - 1] + leadTimesHours[mid]) / 2) * 10) / 10
        : Math.round(leadTimesHours[mid] * 10) / 10;

    return {
      medianHours,
      rating: rateLeadTime(medianHours),
      prCount: leadTimesHours.length,
    };
  } catch (error) {
    core.debug(`DORA lead time failed: ${error}`);
    return { medianHours: 0, rating: "low", prCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Failed Deployment Recovery Time (FDRT) — new in DORA-5
// ---------------------------------------------------------------------------

async function computeFailedDeployRecoveryTime(
  token: string,
  windowDays: number,
  environment?: string,
): Promise<DoraMetrics["failedDeployRecoveryTime"]> {
  const emptyResult = { medianHours: 0, rating: "elite" as const, incidentCount: 0 };

  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const deploymentsInWindow = await loadDeploymentsInWindow(
      octokit,
      owner,
      repo,
      since,
      environment,
    );

    if (deploymentsInWindow.length === 0) {
      const storeEvents = await fetchDeployEventsFromStore(windowDays);
      if (storeEvents && storeEvents.length > 0) {
        core.info(
          `DORA FDRT: using ${storeEvents.length} deploy event(s) from evaluation store`,
        );
        return computeFdrtFromDeployEvents(storeEvents);
      }
      return emptyResult;
    }

    const recoveryTimesHours: number[] = [];

    for (let i = 0; i < deploymentsInWindow.length; i++) {
      const dep = deploymentsInWindow[i];
      try {
        const { data: statuses } = await octokit.request(
          "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
          { owner, repo, deployment_id: dep.id, per_page: 10 },
        );

        const hasFailure = statuses.some(
          (s: { state: string }) => s.state === "failure" || s.state === "error",
        );

        if (hasFailure) {
          const failureTime = new Date(dep.created_at).getTime();
          let recoveryTime: number | null = null;

          for (let j = i - 1; j >= 0; j--) {
            const nextDep = deploymentsInWindow[j];
            const { data: nextStatuses } = await octokit.request(
              "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
              { owner, repo, deployment_id: nextDep.id, per_page: 10 },
            );
            const succeeded = nextStatuses.some(
              (s: { state: string }) => s.state === "success",
            );
            if (succeeded) {
              recoveryTime = new Date(nextDep.created_at).getTime();
              break;
            }
          }

          if (recoveryTime !== null) {
            const hours = (recoveryTime - failureTime) / (1000 * 60 * 60);
            recoveryTimesHours.push(Math.max(0, hours));
          }
        }
      } catch {
        // skip deployments we can't fetch statuses for
      }
    }

    if (recoveryTimesHours.length > 0) {
      const medianHours = median(recoveryTimesHours);
      return {
        medianHours,
        rating: rateFDRT(medianHours),
        incidentCount: recoveryTimesHours.length,
      };
    }

    const storeEvents = await fetchDeployEventsFromStore(windowDays);
    if (storeEvents && storeEvents.length > 0) {
      const fromStore = computeFdrtFromDeployEvents(storeEvents);
      if (fromStore.incidentCount > 0) {
        core.info(
          `DORA FDRT: using evaluation store (${fromStore.incidentCount} incident(s))`,
        );
        return fromStore;
      }
    }

    return emptyResult;
  } catch (error) {
    core.warning(
      `DORA FDRT: GitHub Deployments API failed (${error}). ` +
        `Grant deployments:read to GITHUB_TOKEN, or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for evaluation-store fallback.`,
    );
    const storeEvents = await fetchDeployEventsFromStore(windowDays);
    if (storeEvents && storeEvents.length > 0) {
      return computeFdrtFromDeployEvents(storeEvents);
    }
    return { medianHours: 0, rating: "low", incidentCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Change Rework Rate — new in DORA-5
// ---------------------------------------------------------------------------

async function computeChangeReworkRate(
  token: string,
  windowDays: number,
  servicePaths?: string[],
): Promise<DoraMetrics["changeReworkRate"]> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    });

    let mergedInWindow = prs.filter(
      (pr) => pr.merged_at && new Date(pr.merged_at).toISOString() >= since,
    );

    if (servicePaths && servicePaths.length > 0) {
      mergedInWindow = await filterPrsByServicePaths(
        octokit,
        owner,
        repo,
        mergedInWindow,
        servicePaths,
      );
    }

    const total = mergedInWindow.length;
    if (total < 2) {
      return { percentage: 0, reworkPrs: 0, total, rating: "elite" };
    }

    const prFiles = new Map<number, Set<string>>();
    const sampleSize = Math.min(total, 30);

    for (const pr of mergedInWindow.slice(0, sampleSize)) {
      try {
        const { data: files } = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 100,
        });
        prFiles.set(pr.number, new Set(files.map((f) => f.filename)));
      } catch {
        // skip PRs we can't fetch files for
      }
    }

    const REWORK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    let reworkCount = 0;

    const sortedPrs = mergedInWindow
      .slice(0, sampleSize)
      .sort(
        (a, b) =>
          new Date(a.merged_at ?? 0).getTime() - new Date(b.merged_at ?? 0).getTime(),
      );

    for (let i = 1; i < sortedPrs.length; i++) {
      const currentFiles = prFiles.get(sortedPrs[i].number);
      if (!currentFiles || currentFiles.size === 0) continue;

      const currentMergedAt = new Date(sortedPrs[i].merged_at ?? 0).getTime();

      for (let j = i - 1; j >= 0; j--) {
        const prevMergedAt = new Date(sortedPrs[j].merged_at ?? 0).getTime();
        if (currentMergedAt - prevMergedAt > REWORK_WINDOW_MS) break;

        const prevFiles = prFiles.get(sortedPrs[j].number);
        if (!prevFiles) continue;

        const overlap = [...currentFiles].filter((f) => prevFiles.has(f));
        if (overlap.length > 0) {
          reworkCount++;
          break;
        }
      }
    }

    const percentage =
      sampleSize > 0 ? Math.round((reworkCount / sampleSize) * 1000) / 10 : 0;

    return {
      percentage,
      reworkPrs: reworkCount,
      total: sampleSize,
      rating: rateReworkRate(percentage),
    };
  } catch (error) {
    core.debug(`DORA rework rate failed: ${error}`);
    return { percentage: 0, reworkPrs: 0, total: 0, rating: "low" };
  }
}

// ---------------------------------------------------------------------------
// Per-service PR filter helper
// ---------------------------------------------------------------------------

type OctokitInstance = ReturnType<typeof github.getOctokit>;

interface PrMinimal {
  number: number;
}

async function filterPrsByServicePaths<T extends PrMinimal>(
  octokit: OctokitInstance,
  owner: string,
  repo: string,
  prs: T[],
  servicePaths: string[],
): Promise<T[]> {
  const pathPatterns = servicePaths.map((p) => {
    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "<<GLOBSTAR>>")
      .replace(/\*/g, "[^/]*")
      .replace(/<<GLOBSTAR>>/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
  });

  const filtered: T[] = [];
  const sampleSize = Math.min(prs.length, 30);

  for (const pr of prs.slice(0, sampleSize)) {
    try {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });

      const touchesService = files.some((f) =>
        pathPatterns.some((p) => p.test(f.filename)),
      );

      if (touchesService) {
        filtered.push(pr);
      }
    } catch {
      // skip PRs we can't fetch files for
    }
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DoraOptions {
  windowDays?: number;
  environment?: string;
  servicePaths?: string[];
}

export async function computeDoraMetrics(
  token: string,
  windowDaysOrOptions: number | DoraOptions = 30,
): Promise<DoraMetrics> {
  const opts: DoraOptions =
    typeof windowDaysOrOptions === "number"
      ? { windowDays: windowDaysOrOptions }
      : windowDaysOrOptions;

  const windowDays = opts.windowDays ?? 30;
  const environment = opts.environment;
  const servicePaths = opts.servicePaths;

  const [
    deploymentFrequency,
    changeFailureRate,
    leadTimeToChange,
    failedDeployRecoveryTime,
    changeReworkRate,
  ] = await Promise.all([
    computeDeploymentFrequency(token, windowDays, environment),
    computeChangeFailureRate(token, windowDays, servicePaths),
    computeLeadTimeToChange(token, windowDays, servicePaths),
    computeFailedDeployRecoveryTime(token, windowDays, environment),
    computeChangeReworkRate(token, windowDays, servicePaths),
  ]);

  const partial = {
    deploymentFrequency,
    changeFailureRate,
    leadTimeToChange,
    failedDeployRecoveryTime,
    changeReworkRate,
  };

  return {
    ...partial,
    overallRating: overallDoraRating(partial),
    environment,
    service: servicePaths ? "filtered" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Human-readable labels (action outputs + dashboards)
// ---------------------------------------------------------------------------

export function formatDeploymentFrequencyForOutput(deploysPerWeek: number): string {
  if (deploysPerWeek <= 0) {
    return "none in window (no successful default-branch deploy workflows in period)";
  }
  if (deploysPerWeek >= 1) {
    const w = Math.round(deploysPerWeek * 10) / 10;
    return `${w} per week`;
  }
  const perMonth = Math.round(deploysPerWeek * 30 * 10) / 10;
  return `${perMonth} per month`;
}

function formatDeploymentFrequencyCompact(deploysPerWeek: number): string {
  if (deploysPerWeek <= 0) {
    return "none";
  }
  if (deploysPerWeek >= 1) {
    return `${Math.round(deploysPerWeek * 10) / 10}/week`;
  }
  return `${Math.round(deploysPerWeek * 30 * 10) / 10}/month`;
}

// ---------------------------------------------------------------------------
// Badge + Job Summary formatting
// ---------------------------------------------------------------------------

const RATING_COLORS: Record<DoraRating, string> = {
  elite: "brightgreen",
  high: "green",
  medium: "yellow",
  low: "red",
};

function shieldBadge(label: string, value: string, color: string): string {
  const l = encodeURIComponent(label);
  const v = encodeURIComponent(value);
  return `![${label}](https://img.shields.io/badge/${l}-${v}-${color})`;
}

function formatHoursLabel(hours: number): string {
  if (hours >= 24) {
    return `${Math.round((hours / 24) * 10) / 10} days`;
  }
  return `${hours} hours`;
}

export function formatDoraReport(metrics: DoraMetrics): string {
  const df = metrics.deploymentFrequency;
  const cfr = metrics.changeFailureRate;
  const lt = metrics.leadTimeToChange;
  const fdrt = metrics.failedDeployRecoveryTime;
  const rework = metrics.changeReworkRate;

  const dfLabel = formatDeploymentFrequencyCompact(df.deploysPerWeek);
  const dfTableLabel = formatDeploymentFrequencyForOutput(df.deploysPerWeek);
  const ltLabel = formatHoursLabel(lt.medianHours);
  const fdrtLabel = fdrt.incidentCount === 0 ? "n/a" : formatHoursLabel(fdrt.medianHours);

  const envSuffix = metrics.environment ? ` — ${metrics.environment}` : "";

  const lines = [
    `### DORA-5 Metrics (${df.window}-day window${envSuffix})`,
    ``,
    [
      shieldBadge("deploy frequency", dfLabel, RATING_COLORS[df.rating]),
      shieldBadge("change failure rate", `${cfr.percentage}%`, RATING_COLORS[cfr.rating]),
      shieldBadge("lead time", ltLabel, RATING_COLORS[lt.rating]),
      shieldBadge("FDRT", fdrtLabel, RATING_COLORS[fdrt.rating]),
      shieldBadge(
        "DORA rating",
        metrics.overallRating.toUpperCase(),
        RATING_COLORS[metrics.overallRating],
      ),
    ].join(" "),
    ``,
    `| Metric | Value | Rating |`,
    `|--------|-------|--------|`,
    `| Deployment Frequency | ${dfTableLabel} | ${df.rating.toUpperCase()} |`,
    `| Change Failure Rate | ${cfr.percentage}% (${cfr.failures}/${cfr.total}) | ${cfr.rating.toUpperCase()} |`,
    `| Lead Time to Change | ${ltLabel} (median, ${lt.prCount} PRs) | ${lt.rating.toUpperCase()} |`,
    `| Failed Deploy Recovery | ${fdrtLabel}${fdrt.incidentCount > 0 ? ` (${fdrt.incidentCount} incident${fdrt.incidentCount === 1 ? "" : "s"})` : ""} | ${fdrt.rating.toUpperCase()} |`,
    `| Change Rework Rate | ${rework.percentage}% (${rework.reworkPrs}/${rework.total}) | ${rework.rating.toUpperCase()} |`,
    `| **Overall** | | **${metrics.overallRating.toUpperCase()}** |`,
    ``,
  ];

  return lines.join("\n");
}
