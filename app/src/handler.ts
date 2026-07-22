import { createAppAuth } from "@octokit/auth-app";
import crypto from "node:crypto";
import { parseRepoConfigContent } from "./config-core.js";
import {
  DEFAULT_SELF_CHECK_NAMES,
  evaluateRequiredChecks,
  normalizeCheckRuns,
  type RawCheckRun,
} from "./ci-core.js";
import { matchContext, resolveGateMode } from "./context-matcher.js";
import { evaluateDeploymentGate } from "./deployment-gate.js";
import { isInFreezeWindow, type FileInfo } from "./risk-engine.js";
import type { ContextCiConfig, RepoConfig } from "./types.js";
import { fetchGitHubJsonPages } from "./github-pagination.js";

// ---------------------------------------------------------------------------
// Configuration from environment
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    appId: process.env.GITHUB_APP_ID ?? "",
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    riskThreshold: parseInt(process.env.RISK_THRESHOLD ?? "70", 10),
    warnThreshold: parseInt(process.env.WARN_THRESHOLD ?? "55", 10),
    gateMode: process.env.GATE_MODE as
      | "release-ready"
      | "advisory"
      | "risk-only"
      | undefined,
  };
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return !secret;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeploymentProtectionPayload {
  action: string;
  environment: string;
  deployment: {
    id: number;
    ref: string;
    sha: string;
    creator: { login: string };
  };
  deployment_callback_url: string;
  installation: { id: number };
  repository: {
    full_name: string;
    default_branch: string;
  };
}

interface PullRequestSummary {
  number: number;
  title: string;
  changed_files: number;
  additions: number;
  deletions: number;
  user: { login: string };
  base: { ref: string };
  head: { ref: string };
  labels: Array<{ name: string }>;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function findPrForSha(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<PullRequestSummary | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`,
      { headers: ghHeaders(token) },
    );
    if (!res.ok) return null;
    const prs = (await res.json()) as PullRequestSummary[];
    const summary = prs[0];
    if (!summary) return null;

    const detailRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${summary.number}`,
      { headers: ghHeaders(token) },
    );
    if (!detailRes.ok) return summary;
    return (await detailRes.json()) as PullRequestSummary;
  } catch {
    return null;
  }
}

async function fetchChangedFilesFromApi(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<FileInfo[]> {
  const result = await fetchGitHubJsonPages<FileInfo>(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    { headers: ghHeaders(token) },
    { perPage: 100, maxPages: 30 },
  );
  if (!result.complete) {
    process.stdout.write(
      JSON.stringify({
        level: "warn",
        msg: "PR file enumeration reached GitHub's 3,000-file API ceiling",
        service: "trailhead-app",
        ts: new Date().toISOString(),
        fileCount: result.items.length,
      }) + "\n",
    );
  }
  return result.items;
}

async function fetchChangedFilesFromCommits(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<FileInfo[]> {
  const { items: commits } = await fetchGitHubJsonPages<{ sha: string }>(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/commits`,
    { headers: ghHeaders(token) },
    { perPage: 100, maxPages: 3 },
  );

  const fileMap = new Map<string, FileInfo>();
  for (const commit of commits) {
    const detailRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
      { headers: ghHeaders(token) },
    );
    if (!detailRes.ok) continue;
    const detail = (await detailRes.json()) as {
      files?: Array<{
        filename: string;
        additions?: number;
        deletions?: number;
        changes: number;
      }>;
    };
    for (const f of detail.files ?? []) {
      const existing = fileMap.get(f.filename);
      if (existing) {
        existing.changes += f.changes;
      } else {
        fileMap.set(f.filename, { filename: f.filename, changes: f.changes });
      }
    }
  }
  return Array.from(fileMap.values());
}

const DRIFT_CHECK_FILE_THRESHOLD = 30;
const MERGE_BASE_DRIFT_RATIO = 2.0;

async function fetchChangedFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<FileInfo[]> {
  try {
    const apiFiles = await fetchChangedFilesFromApi(token, owner, repo, prNumber);

    if (apiFiles.length <= DRIFT_CHECK_FILE_THRESHOLD) {
      return apiFiles;
    }

    let commitFiles: FileInfo[];
    try {
      commitFiles = await fetchChangedFilesFromCommits(token, owner, repo, prNumber);
    } catch {
      return apiFiles;
    }

    if (
      commitFiles.length > 0 &&
      apiFiles.length > commitFiles.length * MERGE_BASE_DRIFT_RATIO
    ) {
      process.stdout.write(
        JSON.stringify({
          level: "info",
          msg: "Merge-base drift detected, using commit-derived file list",
          service: "trailhead-app",
          ts: new Date().toISOString(),
          apiFileCount: apiFiles.length,
          commitFileCount: commitFiles.length,
        }) + "\n",
      );
      return commitFiles;
    }

    return apiFiles;
  } catch {
    return [];
  }
}

async function fetchRepoConfig(
  token: string,
  owner: string,
  repo: string,
): Promise<RepoConfig | null> {
  try {
    const headers = ghHeaders(token);
    let res: Response | null = null;
    for (const path of [".trailhead.yml", ".deployguard.yml"]) {
      const candidate = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers },
      );
      if (candidate.ok) {
        res = candidate;
        break;
      }
      if (candidate.status !== 404) return null;
    }
    if (!res) return null;
    const data = (await res.json()) as { content?: string; type?: string };
    if (data.type !== "file" || !data.content) return null;
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return parseRepoConfigContent(content);
  } catch {
    return null;
  }
}

async function fetchCheckRunsForRef(
  token: string,
  owner: string,
  repo: string,
  headSha: string,
): Promise<ReturnType<typeof normalizeCheckRuns>> {
  const runs: RawCheckRun[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}/check-runs?per_page=100&page=${page}`,
      { headers: ghHeaders(token) },
    );
    if (!res.ok) break;

    const data = (await res.json()) as {
      check_runs: Array<{
        name: string;
        status: string;
        conclusion: string | null;
        html_url?: string | null;
        details_url?: string | null;
      }>;
    };

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

  return normalizeCheckRuns(runs, DEFAULT_SELF_CHECK_NAMES);
}

function resolveThresholds(
  repoConfig: RepoConfig | null,
  environment: string,
  contextThresholds: { risk?: number; warn?: number } | undefined,
  defaults: { risk: number; warn: number },
): { risk: number; warn: number } {
  const envOverrides = repoConfig?.environments?.[environment];
  return {
    risk:
      contextThresholds?.risk ??
      envOverrides?.risk ??
      repoConfig?.thresholds?.risk ??
      defaults.risk,
    warn:
      contextThresholds?.warn ??
      envOverrides?.warn ??
      repoConfig?.thresholds?.warn ??
      defaults.warn,
  };
}

function resolveCiConfig(
  repoConfig: RepoConfig | null,
  matchedContext: ReturnType<typeof matchContext>,
): ContextCiConfig {
  if (matchedContext?.context.ci) {
    return matchedContext.context.ci;
  }
  return { required_checks: [], optional_checks: [], missing_required: "fail" };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleDeploymentProtectionRule(
  payload: DeploymentProtectionPayload,
  rawBody: string,
  signature: string,
): Promise<void> {
  const config = getConfig();

  if (config.webhookSecret) {
    if (!verifySignature(rawBody, signature, config.webhookSecret)) {
      throw new Error("Invalid webhook signature");
    }
  }

  const [owner, repo] = payload.repository.full_name.split("/");

  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: payload.installation.id,
  });

  const { token } = await auth({ type: "installation" });

  const [pr, repoConfig] = await Promise.all([
    findPrForSha(token, owner, repo, payload.deployment.sha),
    fetchRepoConfig(token, owner, repo),
  ]);

  const files = pr ? await fetchChangedFiles(token, owner, repo, pr.number) : [];

  const schemaVersion = repoConfig?.schema_version ?? 1;
  const gateMode = resolveGateMode(
    repoConfig?.gate?.mode,
    schemaVersion,
    config.gateMode,
  );

  const matched = pr
    ? matchContext(repoConfig?.contexts ?? [], {
        baseRef: pr.base.ref,
        headRef: pr.head.ref,
        labels: pr.labels.map((l) => l.name),
      })
    : null;

  const thresholds = resolveThresholds(
    repoConfig,
    payload.environment,
    matched?.context.thresholds,
    { risk: config.riskThreshold, warn: config.warnThreshold },
  );

  let ciSummary = null;
  if (gateMode !== "risk-only" && pr) {
    const ciConfig = resolveCiConfig(repoConfig, matched);
    const allChecks = await fetchCheckRunsForRef(
      token,
      owner,
      repo,
      payload.deployment.sha,
    );
    ciSummary = evaluateRequiredChecks(allChecks, ciConfig);
  }

  const freezeCheck = isInFreezeWindow(repoConfig?.freeze ?? []);

  const prRef = pr ? `PR #${pr.number}` : payload.deployment.sha.substring(0, 7);
  const result = evaluateDeploymentGate({
    files,
    gateMode,
    riskThreshold: thresholds.risk,
    warnThreshold: thresholds.warn,
    ciSummary,
    freezeActive: freezeCheck.frozen,
    freezeMessage: freezeCheck.message,
    context: matched?.matched ?? null,
    prRef,
    environment: payload.environment,
  });

  const state: "approved" | "rejected" = result.approved ? "approved" : "rejected";
  const comment =
    result.comment +
    (state === "rejected"
      ? "\n\n> Review the changes and reduce risk before deploying."
      : "");

  await fetch(payload.deployment_callback_url, {
    method: "POST",
    headers: {
      ...ghHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      environment_name: payload.environment,
      state,
      comment,
    }),
  });

  const logEntry = {
    level: "info",
    msg: "Gate evaluation complete",
    service: "trailhead-app",
    ts: new Date().toISOString(),
    state,
    gateMode,
    environment: payload.environment,
    pr: prRef,
    riskScore: result.riskScore,
    releaseReady: result.releaseReady,
    threshold: thresholds.risk,
    context: matched?.matched.name,
  };
  process.stdout.write(JSON.stringify(logEntry) + "\n");
}
