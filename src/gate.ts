import * as core from "@actions/core";
import * as github from "@actions/github";
import { GateApiResponse as GateApiResponseSchema } from "./types.js";
import type {
  TrailheadConfig,
  AvailabilityStance,
  BriefAction,
  BriefFinding,
  BriefVerdict,
  GateApiResponse,
  GateDecision,
  GateEvaluation,
  HealthCheckResult,
  InputRelevanceEntry,
  PrProvenance,
  ReleaseBrief,
  RemediationSeverity,
  RepoConfig,
  RiskFactor,
  GateMode,
  CiSummary,
  CiCheck,
} from "./types.js";
import { loadRepoConfig } from "./config.js";
import { matchContext, resolveGateMode } from "./context-matcher.js";
import type { PrMatchContext } from "./context-matcher.js";
import {
  detectCrossRepoImpact,
  formatCrossRepoImpactSection,
  loadConsumerRegistryFile,
  sendCrossRepoImpactWebhooks,
} from "./cross-repo-impact.js";
import {
  evaluateRequiredChecks,
  fetchCheckRuns,
  formatCiStatusIcon,
  waitForChecks,
} from "./ci-orchestrator.js";
import {
  applyReleaseReadyToEvaluation,
  checkConclusionForEvaluation,
  checkCountsTowardBlocking,
  computeReleaseReady,
  resolveCheckName,
  shouldBlockMerge,
} from "./release-ready.js";
import {
  dispositionCountsTowardBlocking,
  resolveDispositions,
} from "./input-relevance.js";
import { formatEvaluationDelta, renderReleaseBrief } from "./release-brief.js";
import {
  computeRiskScore as computeRiskScoreShared,
  weightedAverageScores,
  detectDependencyChanges,
  decideGate,
  decideSensitiveFilesEscalation,
  isSensitiveFile,
  matchesGlobs,
  matchRiskProfile,
  riskConfigFromRepo,
  sensitivityWeight as sensitivityWeightShared,
  splitSizeFactors,
  isInFreezeWindow,
  type FileInfo,
  type RiskFactorResult,
} from "./risk-engine.js";
import {
  fetchCodeScanningAlerts,
  computeSecurityRiskFactor,
  decideSecurityBlock,
} from "./security.js";
import {
  buildRemediation,
  formatAgentBrief,
  resolveAgentBriefMode,
  isAgentProvenanceType,
} from "./remediation.js";
import {
  fetchPreviousEvaluationForPr,
  countRecentLabelOverrides,
} from "./evaluation-history.js";
import type { PreviousEvaluationSnapshot } from "./loop-bookkeeping.js";
import {
  applyLabelOverrideToEvaluation,
  hasOverrideLabel,
  OVERRIDE_LABEL,
  resolveLabelOverride,
} from "./override.js";
import {
  runSubmissionGate,
  getSubmissionConfigWarnings,
  submissionGateShouldBlock,
} from "./submission-engine.js";
import { loadCatalogIndex } from "./catalog-index.js";
import type { SubmissionCheckResult } from "./types.js";
import { computeAgentTrustScore, strictnessFromTrust } from "./trust-score.js";
import { parseAgentTrustMetrics } from "./agent-trust-metrics.js";
import { readTrustRuntime } from "./trust-runtime.js";
import { detectCiIntegrity } from "./ci-integrity.js";
import { collectGitHubPages } from "./github-pagination.js";

export {
  isSensitiveFile,
  matchesGlobs,
  isRollback,
  isInFreezeWindow,
  decideGate,
} from "./risk-engine.js";

// Re-export sensitivityWeight with the RepoConfig-compatible signature
export function sensitivityWeight(
  filename: string,
  repoConfig?: RepoConfig | null,
): number {
  return sensitivityWeightShared(filename, repoConfig ?? null);
}

function parseDeclaredPackages(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// PR file metadata used for risk heuristics
// ---------------------------------------------------------------------------

interface PrFileInfo {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  status?: string;
  content?: string;
}

// ---------------------------------------------------------------------------
// PR diff fetching via @actions/github
// ---------------------------------------------------------------------------

async function fetchPrFilesFromApi(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrFileInfo[]> {
  const result = await collectGitHubPages(
    async (page, perPage) => {
      const { data } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: perPage,
        page,
      });
      return data;
    },
    { perPage: 100, maxPages: 30 },
  );

  if (!result.complete) {
    core.warning(
      "PR file enumeration reached GitHub's 3,000-file API ceiling; risk analysis is incomplete.",
    );
  }

  return result.items.map((f) => ({
    filename: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch,
    status: f.status,
  }));
}

async function fetchPrFilesFromCommits(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrFileInfo[]> {
  const { items: commits } = await collectGitHubPages(
    async (page, perPage) => {
      const { data } = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: perPage,
        page,
      });
      return data;
    },
    { perPage: 100, maxPages: 3 },
  );

  const fileMap = new Map<string, PrFileInfo>();

  for (const commit of commits) {
    const { data: detail } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: commit.sha,
    });

    for (const f of detail.files ?? []) {
      const existing = fileMap.get(f.filename);
      if (existing) {
        existing.additions += f.additions ?? 0;
        existing.deletions += f.deletions ?? 0;
        existing.changes += f.changes ?? 0;
      } else {
        fileMap.set(f.filename, {
          filename: f.filename,
          additions: f.additions ?? 0,
          deletions: f.deletions ?? 0,
          changes: f.changes ?? 0,
          patch: undefined,
        });
      }
    }
  }

  return Array.from(fileMap.values());
}

// Skip the commit-based cross-check for small PRs (cheap fast path).
const DRIFT_CHECK_FILE_THRESHOLD = 30;
// If the API reports more than 2x the files the commits actually touch,
// the merge-base is stale and we use the commit-derived list instead.
const MERGE_BASE_DRIFT_RATIO = 2.0;

const API_ROUTE_FILE =
  /(?:^|\/)(?:app\/api\/.+\/route|pages\/api\/.+)\.(?:ts|tsx|js|jsx)$/;

async function hydrateChangedRouteContents(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  ref: string,
  files: PrFileInfo[],
): Promise<void> {
  const routes = files.filter(
    (file) =>
      file.status !== "removed" && API_ROUTE_FILE.test(file.filename.replace(/\\/g, "/")),
  );

  // Keep the request fan-out bounded while still avoiding serial latency on
  // route-heavy PRs. Route bodies are the source of truth for auth checks.
  const batchSize = 8;
  for (let start = 0; start < routes.length; start += batchSize) {
    await Promise.all(
      routes.slice(start, start + batchSize).map(async (file) => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.filename,
            ref,
          });
          if (Array.isArray(data) || data.type !== "file" || !data.content) return;
          file.content = Buffer.from(data.content, "base64").toString("utf8");
        } catch (error) {
          core.debug(`Could not fetch current route body for ${file.filename}: ${error}`);
        }
      }),
    );
  }
}

async function fetchPrFiles(prNumber: number, token?: string): Promise<PrFileInfo[]> {
  if (!token) return [];

  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const apiFiles = await fetchPrFilesFromApi(octokit, owner, repo, prNumber);

    let selectedFiles = apiFiles;

    if (apiFiles.length > DRIFT_CHECK_FILE_THRESHOLD) {
      // GitHub's pulls.listFiles uses a merge-base diff that can include
      // files from unrelated commits when the base branch has diverged
      // from the PR branch point. Cross-check against the files the PR's
      // commits actually touch and fall back when inflation is detected.
      core.info(
        `PR reports ${apiFiles.length} files (>${DRIFT_CHECK_FILE_THRESHOLD}), ` +
          `cross-checking against commit-level file list for merge-base drift.`,
      );

      let commitFiles: PrFileInfo[] = [];
      try {
        commitFiles = await fetchPrFilesFromCommits(octokit, owner, repo, prNumber);
      } catch (err) {
        core.debug(`Commit-level file enumeration failed, using API list: ${err}`);
      }

      if (
        commitFiles.length > 0 &&
        apiFiles.length > commitFiles.length * MERGE_BASE_DRIFT_RATIO
      ) {
        core.warning(
          `Merge-base drift: API reported ${apiFiles.length} files, ` +
            `but PR commits only touch ${commitFiles.length}. ` +
            `Using commit-derived file list to avoid inflated risk scores.`,
        );
        const apiByName = new Map(apiFiles.map((file) => [file.filename, file]));
        selectedFiles = commitFiles.map((file) => ({
          ...file,
          patch: apiByName.get(file.filename)?.patch,
          status: apiByName.get(file.filename)?.status,
        }));
      }
    }

    return selectedFiles;
  } catch (error) {
    core.debug(`Failed to fetch PR files: ${error}`);
    return [];
  }
}

/**
 * Full file list of the PR head tree (git ls-files equivalent, via the API) so
 * import_resolution can resolve relative imports to existing, UNCHANGED siblings
 * — not just files in the PR diff. Returns undefined on any failure or a truncated
 * tree, which leaves import_resolution dormant rather than risking false positives.
 */
async function fetchRepoPaths(
  prNumber: number,
  token?: string,
): Promise<string[] | undefined> {
  if (!token) return undefined;
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const headSha =
      (github.context.payload?.pull_request as { head?: { sha?: string } } | undefined)
        ?.head?.sha ??
      (await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })).data.head
        .sha;
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: headSha,
      recursive: "true",
    });
    if (data.truncated) {
      core.debug(
        "Repo tree truncated; skipping repoPaths (import_resolution stays dormant).",
      );
      return undefined;
    }
    return data.tree
      .filter((e) => e.type === "blob" && typeof e.path === "string")
      .map((e) => e.path as string);
  } catch (error) {
    core.debug(`Failed to fetch repo tree for repoPaths: ${error}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Risk scoring — delegates to shared engine
// ---------------------------------------------------------------------------

export function computeRiskScore(
  files: PrFileInfo[],
  repoConfig?: RepoConfig | null,
): {
  score: number;
  factors: RiskFactor[];
  sizeScore?: number;
  sizeFactors?: RiskFactor[];
} {
  const fileInfos: FileInfo[] = files.map((f) => ({
    filename: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
  }));

  const result = computeRiskScoreShared(fileInfos, riskConfigFromRepo(repoConfig));

  return {
    score: result.score,
    factors: result.factors as RiskFactor[],
    sizeScore: result.sizeScore,
    sizeFactors: result.sizeFactors as RiskFactor[] | undefined,
  };
}

// ---------------------------------------------------------------------------
// Author history risk factor
// ---------------------------------------------------------------------------

async function computeAuthorHistory(
  prNumber: number,
  token: string,
): Promise<RiskFactor | null> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    const author = pr.user?.login;
    if (!author) return null;

    if (author.endsWith("[bot]")) {
      return {
        type: "author_history",
        score: 20,
        detail: {
          author,
          commitCount: 0,
          dayRange: 90,
          description: "Bot account — automated change",
        },
      };
    }

    const authorEmails = new Set<string>();

    try {
      const { data: prCommits } = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      for (const commit of prCommits) {
        const email = commit.commit?.author?.email?.trim().toLowerCase();
        if (email) authorEmails.add(email);
      }
    } catch (error) {
      core.debug(`Unable to collect PR author emails for history: ${error}`);
    }

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const commitShas = new Set<string>();

    const { data: commitsByLogin } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      author,
      since,
      per_page: 100,
    });
    for (const c of commitsByLogin) commitShas.add(c.sha);

    for (const email of authorEmails) {
      if (commitShas.size >= 50) break;
      try {
        const { data: commitsByEmail } = await octokit.rest.repos.listCommits({
          owner,
          repo,
          author: email,
          since,
          per_page: 100,
        });
        for (const c of commitsByEmail) commitShas.add(c.sha);
      } catch {
        core.debug(`Email-based commit lookup failed for ${email}`);
      }
    }

    const commitCount = commitShas.size;
    const score =
      commitCount === 0 ? 100 : Math.max(5, Math.round(100 / (1 + commitCount / 10)));

    return {
      type: "author_history",
      score,
      detail: {
        author,
        commitCount,
        dayRange: 90,
        description: "Author familiarity risk (90-day commits, lower is better)",
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PR age factor
// ---------------------------------------------------------------------------

async function computePrAge(prNumber: number, token: string): Promise<RiskFactor | null> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    if (!pr.created_at) return null;

    const createdAt = new Date(pr.created_at).getTime();
    if (isNaN(createdAt)) return null;

    const ageDays = Math.round((Date.now() - createdAt) / (24 * 60 * 60 * 1000));

    if (ageDays <= 2) return null;

    const score = Math.min(100, Math.round(ageDays * 5));

    return {
      type: "pr_age",
      score,
      detail: {
        ageDays,
        createdAt: pr.created_at,
        description: `PR has been open for ${ageDays} day${ageDays === 1 ? "" : "s"}`,
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PR provenance detection
// ---------------------------------------------------------------------------

function classifyFromSignals(signals: string[]): PrProvenance {
  const text = signals.join(" ").toLowerCase();
  const candidates: Record<PrProvenance["type"], number> = {
    human: 0.55,
    dependabot: 0,
    copilot: 0,
    codex: 0,
    claude: 0,
    "custom-bot": 0,
    unknown: 0.25,
  };

  if (/\[bot\]/.test(text))
    candidates["custom-bot"] = Math.max(candidates["custom-bot"], 0.8);
  if (/dependabot/.test(text)) candidates.dependabot = 0.99;
  if (/copilot/.test(text)) candidates.copilot = Math.max(candidates.copilot, 0.93);
  if (/\bclaude\b|anthropic/.test(text))
    candidates.claude = Math.max(candidates.claude, 0.92);
  if (/\bcodex\b|\bopenai\b/.test(text))
    candidates.codex = Math.max(candidates.codex, 0.9);
  if (/^cursor\/| cursor\//.test(text))
    candidates.codex = Math.max(candidates.codex, 0.82);
  if (/^agent\/| agent\//.test(text)) {
    candidates["custom-bot"] = Math.max(candidates["custom-bot"], 0.86);
  }

  if (candidates["custom-bot"] >= 0.8) {
    candidates.human = Math.min(candidates.human, 0.2);
  }

  let bestType: PrProvenance["type"] = "unknown";
  let bestConfidence = 0;
  for (const [type, confidence] of Object.entries(candidates) as Array<
    [PrProvenance["type"], number]
  >) {
    if (confidence > bestConfidence) {
      bestType = type;
      bestConfidence = confidence;
    }
  }

  return {
    type: bestType,
    confidence: Math.round(bestConfidence * 100) / 100,
    source: "author/branch/commit-signals",
  };
}

async function detectPrProvenance(
  prNumber: number,
  token: string,
): Promise<PrProvenance | null> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const [{ data: pr }, { data: commits }] = await Promise.all([
      octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      }),
      octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 50,
      }),
    ]);

    const signals: string[] = [];
    if (pr.user?.login) signals.push(pr.user.login);
    if (pr.head?.ref) signals.push(pr.head.ref);
    for (const commit of commits) {
      if (commit.author?.login) signals.push(commit.author.login);
      if (commit.commit?.author?.name) signals.push(commit.commit.author.name);
      if (commit.commit?.author?.email) signals.push(commit.commit.author.email);
      if (commit.committer?.login) signals.push(commit.committer.login);
    }

    if (signals.length === 0) {
      return { type: "unknown", confidence: 0.2, source: "insufficient-signals" };
    }

    return classifyFromSignals(signals);
  } catch (error) {
    core.debug(`Failed to detect PR provenance: ${error}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CI integrity detection
// ---------------------------------------------------------------------------

interface CiIntegrityDetection {
  factor: RiskFactor | null;
  blockingPatterns: string[];
  /** Surfaced (not only buried in factor.detail) so ADR-011 can enumerate them. */
  warningSignals: string[];
}

function detectCiIntegrityRisk(files: PrFileInfo[]): CiIntegrityDetection {
  const { score, blockingPatterns, warningSignals } = detectCiIntegrity(files);

  if (score === 0) {
    return { factor: null, blockingPatterns: [], warningSignals: [] };
  }

  const factor: RiskFactor = {
    type: "ci_integrity",
    score: Math.min(100, score),
    detail: {
      blockingPatterns,
      warningSignals,
      description: "CI confidence and workflow integrity signals",
    },
  };

  return { factor, blockingPatterns, warningSignals };
}

// ---------------------------------------------------------------------------
// Workflow security linting
// ---------------------------------------------------------------------------

interface WorkflowSecurityDetection {
  factor: RiskFactor | null;
  blockingPatterns: string[];
  warnings: string[];
}

function detectWorkflowSecurityRisk(
  files: PrFileInfo[],
  allowUnpinnedActions: string[],
): WorkflowSecurityDetection {
  const blockingPatterns: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  const workflowFiles = files.filter((f) => f.filename.startsWith(".github/workflows/"));

  for (const file of workflowFiles) {
    const patch = file.patch ?? "";
    if (!patch) continue;

    if (/^\+\s*permissions:\s*write-all\b/m.test(patch)) {
      blockingPatterns.push(
        `${file.filename}: introduced over-privileged permissions write-all`,
      );
      score += 55;
    }

    const actionRefMatches = patch.matchAll(
      /^\+\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)\s*$/gm,
    );
    for (const match of actionRefMatches) {
      const action = match[1];
      const ref = match[2];
      const isPinnedSha = /^[a-f0-9]{40}$/i.test(ref);
      const allowListed = allowUnpinnedActions.includes(action);
      if (!isPinnedSha && !allowListed) {
        warnings.push(`${file.filename}: unpinned third-party action ${action}@${ref}`);
        score += 20;
      }
    }

    if (/^\+\s*run:\s*.*\$\{\{\s*github\.event\.[^}]+\}\}/m.test(patch)) {
      warnings.push(
        `${file.filename}: untrusted event data interpolated into shell run step`,
      );
      score += 25;
    }
  }

  if (score === 0) {
    return { factor: null, blockingPatterns: [], warnings: [] };
  }

  return {
    factor: {
      type: "workflow_security",
      score: Math.min(100, score),
      detail: {
        blockingPatterns,
        warnings,
        description: "Workflow security lint signals",
      },
    },
    blockingPatterns,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Prompt/command injection detection
// ---------------------------------------------------------------------------

interface PromptInjectionDetection {
  factor: RiskFactor | null;
  blockingPatterns: string[];
  warnings: string[];
}

function detectPromptInjectionRisk(files: PrFileInfo[]): PromptInjectionDetection {
  const blockingPatterns: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  for (const file of files) {
    const patch = file.patch ?? "";
    if (!patch) continue;

    if (
      /^\+\s*.*(exec|spawn|execa)\([^)]*(req\.(body|query|params)|context\.payload|userInput)/m.test(
        patch,
      )
    ) {
      blockingPatterns.push(
        `${file.filename}: untrusted input appears to flow into command execution`,
      );
      score += 60;
    }

    if (
      /^\+\s*.*(callLLM|sendMessage|generateContent)\([^)]*(req\.(body|query|params)|userInput)/m.test(
        patch,
      ) &&
      !/sanitizeForPrompt\(/.test(patch)
    ) {
      blockingPatterns.push(
        `${file.filename}: untrusted input used in prompt call without sanitizeForPrompt()`,
      );
      score += 60;
    }

    if (
      /^\+\s*.*(callLLM|sendMessage|generateContent)\(/m.test(patch) &&
      !/sanitizeForPrompt\(/.test(patch)
    ) {
      warnings.push(
        `${file.filename}: prompt call added; verify sanitization and escaping`,
      );
      score += 20;
    }
  }

  if (score === 0) {
    return { factor: null, blockingPatterns: [], warnings: [] };
  }

  return {
    factor: {
      type: "prompt_injection_risk",
      score: Math.min(100, score),
      detail: {
        blockingPatterns,
        warnings,
        description: "Prompt/command injection risk signals",
      },
    },
    blockingPatterns,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Supply-chain risk detection
// ---------------------------------------------------------------------------

interface SupplyChainDetection {
  factor: RiskFactor | null;
  blockingPatterns: string[];
  warnings: string[];
  criticalVulnDetected: boolean;
}

function detectSupplyChainRisk(files: PrFileInfo[]): SupplyChainDetection {
  const blockingPatterns: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let criticalVulnDetected = false;

  const dependencyFiles = files.filter((f) =>
    /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|poetry\.lock|Pipfile|Pipfile\.lock)$/.test(
      f.filename,
    ),
  );

  for (const file of dependencyFiles) {
    const patch = file.patch ?? "";
    if (!patch) continue;

    const newPackageLines = patch.match(/^\+\s*"(@?[\w.-]+)"\s*:\s*"[^"]+"/gm) ?? [];
    if (newPackageLines.length > 0) {
      score += Math.min(25, newPackageLines.length * 5);
      warnings.push(
        `${file.filename}: ${newPackageLines.length} new dependency declaration(s) added`,
      );
    }

    const majorBumpRegex =
      /^-\s*"(@?[\w.-]+)"\s*:\s*"\^?(\d+)\.[^"]*"\n\+\s*"\1"\s*:\s*"\^?(\d+)\./gm;
    for (const match of patch.matchAll(majorBumpRegex)) {
      const prevMajor = Number(match[2]);
      const nextMajor = Number(match[3]);
      if (nextMajor > prevMajor) {
        score += 15;
        warnings.push(
          `${file.filename}: major version jump detected for ${match[1]} (${prevMajor} -> ${nextMajor})`,
        );
      }
    }

    if (/^\+\s*"?(@?[\w.-]+)-\1"?\s*:/m.test(patch)) {
      warnings.push(
        `${file.filename}: suspicious repeated package token (possible typosquat)`,
      );
      score += 20;
    }

    if (/CVE-\d{4}-\d+/i.test(patch) && /(critical|severity:\s*critical)/i.test(patch)) {
      criticalVulnDetected = true;
      blockingPatterns.push(
        `${file.filename}: critical vulnerability marker detected in diff`,
      );
      score += 50;
    }
  }

  if (score === 0) {
    return {
      factor: null,
      blockingPatterns: [],
      warnings: [],
      criticalVulnDetected: false,
    };
  }

  return {
    factor: {
      type: "supply_chain",
      score: Math.min(100, score),
      detail: {
        blockingPatterns,
        warnings,
        criticalVulnDetected,
        description: "Supply chain risk signals from dependency changes",
      },
    },
    blockingPatterns,
    warnings,
    criticalVulnDetected,
  };
}

// ---------------------------------------------------------------------------
// PR scope, duplicate logic, and cross-repo impact
// ---------------------------------------------------------------------------

interface PrScopeDetection {
  factor: RiskFactor | null;
  findings: string[];
  forceBlock: boolean;
}

export async function detectPrScopeRisk(params: {
  files: PrFileInfo[];
  repoConfig: RepoConfig | null;
  prNumber?: number;
  token?: string;
  provenance: PrProvenance | null;
  headRef?: string;
  baseRef?: string;
}): Promise<PrScopeDetection> {
  const cfg = params.repoConfig?.policies?.pr_scope;
  if (!cfg?.enabled) return { factor: null, findings: [], forceBlock: false };

  const exempt = (cfg.exempt ?? []).some((rule) => {
    const headOk =
      rule.head_branch.length === 0 ||
      (params.headRef !== undefined && matchesGlobs(params.headRef, rule.head_branch));
    const baseOk =
      rule.base_branch.length === 0 ||
      (params.baseRef !== undefined && matchesGlobs(params.baseRef, rule.base_branch));
    return headOk && baseOk;
  });
  if (exempt) {
    core.info(
      `pr_scope: branch pair ${params.headRef ?? "?"} -> ${params.baseRef ?? "?"} matches an exempt rule — scope limits skipped`,
    );
  }

  const fileCount = params.files.length;
  const totalChanges = params.files.reduce((sum, f) => sum + f.changes, 0);
  const findings: string[] = [];
  let score = 0;

  if (!exempt && fileCount > cfg.max_files) {
    findings.push(`PR scope exceeds max_files (${fileCount} > ${cfg.max_files}).`);
    score += 45;
  }
  if (!exempt && totalChanges > cfg.max_changes) {
    findings.push(`PR scope exceeds max_changes (${totalChanges} > ${cfg.max_changes}).`);
    score += 45;
  }

  if (
    cfg.require_plan_for_agent_prs &&
    params.prNumber &&
    params.token &&
    params.provenance &&
    params.provenance.type !== "human"
  ) {
    try {
      const octokit = github.getOctokit(params.token);
      const { owner, repo } = github.context.repo;
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: params.prNumber,
      });
      const body = (pr.body ?? "").trim();
      const hasPlan =
        /##\s*plan/i.test(body) ||
        /###\s*plan/i.test(body) ||
        /- \[[ xX]\].*test/i.test(body);
      if (!hasPlan) {
        findings.push(
          "Agent PR plan required but PR body lacks a plan/test checklist section.",
        );
        score += 30;
      }
    } catch (error) {
      core.debug(`PR scope plan check failed: ${error}`);
    }
  }

  if (score === 0) {
    return { factor: null, findings: [], forceBlock: false };
  }

  return {
    factor: {
      type: "pr_scope",
      score: Math.min(100, score),
      detail: {
        fileCount,
        totalChanges,
        findings,
        description: "PR size/scope and decomposition risk",
      },
    },
    findings,
    forceBlock: cfg.mode === "block",
  };
}

interface DuplicateLogicDetection {
  factor: RiskFactor | null;
  findings: string[];
}

function detectDuplicateLogicRisk(files: PrFileInfo[]): DuplicateLogicDetection {
  const helperFiles = files.filter((f) =>
    /(?:^|\/)(?:utils?|helpers?|validators?)\/|(?:^|\/)(?:util|helper|validator)\./i.test(
      f.filename,
    ),
  );
  const basenameMap = new Map<string, string[]>();
  for (const file of helperFiles) {
    const normalized = file.filename.replace(/\\/g, "/");
    const base = normalized.split("/").pop() ?? normalized;
    basenameMap.set(base, [...(basenameMap.get(base) ?? []), normalized]);
  }

  const duplicates = [...basenameMap.entries()].filter(([, paths]) => paths.length > 1);
  if (duplicates.length === 0) return { factor: null, findings: [] };

  const findings = duplicates.map(
    ([base, paths]) =>
      `Potential duplicate helper logic for ${base}: ${paths.slice(0, 3).join(", ")}${paths.length > 3 ? "..." : ""}`,
  );
  const score = Math.min(100, duplicates.length * 25);
  return {
    factor: {
      type: "duplicate_logic",
      score,
      detail: {
        duplicates: findings,
        description: "Potential duplicate helper/utility additions",
      },
    },
    findings,
  };
}

// ---------------------------------------------------------------------------
// Session correlation (rapid-fire merge burst)
// ---------------------------------------------------------------------------

interface SessionCorrelationResult {
  burstCount: number;
  windowMinutes: number;
}

async function detectSessionCorrelation(params: {
  prNumber?: number;
  token?: string;
  provenance: PrProvenance | null;
  repoConfig: RepoConfig | null;
}): Promise<SessionCorrelationResult | null> {
  const cfg = params.repoConfig?.policies?.session_correlation;
  if (!cfg?.enabled || !params.prNumber || !params.token || !params.provenance)
    return null;
  if (params.provenance.type === "human") return null;

  try {
    const octokit = github.getOctokit(params.token);
    const { owner, repo } = github.context.repo;
    const { data: currentPr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: params.prNumber,
    });
    const author = currentPr.user?.login;
    if (!author) return null;

    const sinceMs = Date.now() - cfg.window_minutes * 60 * 1000;
    const { data: closedPrs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    });

    const mergedInWindow = closedPrs.filter((pr) => {
      if (!pr.merged_at) return false;
      if (pr.user?.login !== author) return false;
      const mergedAt = Date.parse(pr.merged_at);
      return !Number.isNaN(mergedAt) && mergedAt >= sinceMs;
    });

    return {
      burstCount: mergedInWindow.length,
      windowMinutes: cfg.window_minutes,
    };
  } catch (error) {
    core.debug(`Session correlation detection failed: ${error}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agent PR policy enforcement
// ---------------------------------------------------------------------------

interface AgentPolicyEnforcementResult {
  adjustedRiskThreshold?: number;
  forceBlock: boolean;
  findings: string[];
  notices: string[];
}

async function enforceAgentPrPolicies(params: {
  prNumber?: number;
  token?: string;
  files: PrFileInfo[];
  repoConfig: RepoConfig | null;
  provenance: PrProvenance | null;
  currentRiskThreshold: number;
  matchedContextName?: string;
  headSha?: string;
  prAuthorLogin?: string;
}): Promise<AgentPolicyEnforcementResult | null> {
  const policy = params.repoConfig?.policies?.agent_prs;
  if (!policy?.enabled || !params.prNumber || !params.token) return null;
  const prNumber = params.prNumber;

  const provenanceType = params.provenance?.type ?? "unknown";
  const isUnknownStrict =
    provenanceType === "unknown" && policy.strict_on_unknown_provenance;
  const shouldTreatAsAgent = isUnknownStrict || isAgentProvenanceType(provenanceType);
  if (!shouldTreatAsAgent) return null;

  const findings: string[] = [];
  const notices: string[] = [];
  let adjustedRiskThreshold: number | undefined;
  let forceBlock = false;
  const mode = policy.mode ?? "block";
  const enforce = mode === "block";

  if (isUnknownStrict) {
    findings.push(
      "PR provenance is unknown and strict mode is enabled; applying agent PR policy checks.",
    );
  }

  if (
    policy.risk_threshold !== undefined &&
    policy.risk_threshold < params.currentRiskThreshold
  ) {
    const exemptContext = params.matchedContextName
      ? policy.risk_threshold_exempt_contexts.includes(params.matchedContextName)
      : false;
    if (exemptContext) {
      const notice =
        `Agent PR risk threshold exemption matched context "${params.matchedContextName}"; ` +
        `retaining context threshold ${params.currentRiskThreshold}.`;
      notices.push(notice);
      core.info(notice);
    } else if (enforce) {
      adjustedRiskThreshold = policy.risk_threshold;
      findings.push(
        `Agent PR risk threshold tightened from ${params.currentRiskThreshold} to ${policy.risk_threshold}.`,
      );
    } else {
      findings.push(
        `Agent PR risk threshold would tighten from ${params.currentRiskThreshold} to ${policy.risk_threshold} (warn mode; not applied).`,
      );
    }
  }

  const sensitivePatterns =
    policy.sensitive_paths.length > 0
      ? policy.sensitive_paths
      : (params.repoConfig?.sensitivity.high ?? []);
  const riskConfig = riskConfigFromRepo(params.repoConfig);
  const touchesSensitivePaths =
    params.files.some((f) =>
      sensitivePatterns.length > 0
        ? matchesGlobs(f.filename, sensitivePatterns)
        : isSensitiveFile(f.filename, riskConfig),
    ) || params.files.some((f) => isSensitiveFile(f.filename, riskConfig));

  if (!touchesSensitivePaths) {
    return { adjustedRiskThreshold, forceBlock, findings, notices };
  }

  try {
    const octokit = github.getOctokit(params.token);
    const { owner, repo } = github.context.repo;
    const reviewResult = await collectGitHubPages(async (page, perPage) => {
      const { data } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
        page,
        per_page: perPage,
      });
      return data;
    });
    if (!reviewResult.complete) {
      core.warning(
        "Agent PR approval check skipped because GitHub returned an incomplete review history.",
      );
      return { adjustedRiskThreshold, forceBlock, findings, notices };
    }

    const decisiveStates = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
    const orderedReviews = [...reviewResult.items].sort((left, right) => {
      const leftTime = Date.parse(left.submitted_at ?? "");
      const rightTime = Date.parse(right.submitted_at ?? "");
      const normalizedLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
      const normalizedRightTime = Number.isNaN(rightTime) ? 0 : rightTime;
      return normalizedLeftTime - normalizedRightTime || left.id - right.id;
    });
    const latestDecisionByReviewer = new Map<string, (typeof orderedReviews)[number]>();
    for (const review of orderedReviews) {
      const login = review.user?.login?.trim().toLowerCase();
      const state = review.state.toUpperCase();
      if (!login || !decisiveStates.has(state)) continue;
      latestDecisionByReviewer.set(login, review);
    }

    const expectedHeadSha = params.headSha?.toLowerCase();
    const prAuthorLogin = params.prAuthorLogin?.trim().toLowerCase();
    const approvedBy = new Set(
      [...latestDecisionByReviewer.entries()]
        .filter(([login, review]) => {
          if (login === prAuthorLogin) return false;
          if (review.state.toUpperCase() !== "APPROVED") return false;
          if (!expectedHeadSha) return true;
          return review.commit_id?.toLowerCase() === expectedHeadSha;
        })
        .map(([login]) => login),
    );

    if (approvedBy.size < policy.required_approvals) {
      if (enforce) forceBlock = true;
      findings.push(
        enforce
          ? `Sensitive-path agent PR requires ${policy.required_approvals} current-head approval(s) from reviewer(s) other than the PR author; found ${approvedBy.size}.`
          : `Sensitive-path agent PR would require ${policy.required_approvals} current-head approval(s) from reviewer(s) other than the PR author; found ${approvedBy.size} (warn mode; not blocking).`,
      );
    }

    if (policy.require_code_owner_approval) {
      if (policy.code_owner_reviewers.length === 0) {
        if (enforce) forceBlock = true;
        findings.push(
          enforce
            ? "Code-owner approval required for sensitive-path agent PRs, but no code_owner_reviewers configured."
            : "Code-owner approval would be required for sensitive-path agent PRs, but no code_owner_reviewers are configured (warn mode; not blocking).",
        );
      } else {
        const hasCodeOwnerApproval = policy.code_owner_reviewers.some((r) =>
          approvedBy.has(r.trim().toLowerCase()),
        );
        if (!hasCodeOwnerApproval) {
          if (enforce) forceBlock = true;
          findings.push(
            enforce
              ? `Sensitive-path agent PR requires one code-owner approval (${policy.code_owner_reviewers.join(", ")}).`
              : `Sensitive-path agent PR would require one code-owner approval (${policy.code_owner_reviewers.join(", ")}) (warn mode; not blocking).`,
          );
        }
      }
    }
  } catch (error) {
    core.debug(`Agent PR policy review check failed: ${error}`);
    // Fail-open remains the default: do not force block on API errors.
  }

  return { adjustedRiskThreshold, forceBlock, findings, notices };
}

// ---------------------------------------------------------------------------
// Health check (HTTP)
// ---------------------------------------------------------------------------

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

export async function checkHealth(url: string): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;

    let status: GateDecision;
    if (response.ok) {
      status = "allow";
    } else if (response.status < 500) {
      status = "warn";
    } else {
      status = "block";
    }

    return {
      target: url,
      status,
      latencyMs,
      detail: { httpStatus: response.status },
    };
  } catch (error) {
    return {
      target: url,
      status: "warn",
      latencyMs: Date.now() - start,
      detail: { error: String(error) },
    };
  }
}

// ---------------------------------------------------------------------------
// Health check (MCP Gateway)
// ---------------------------------------------------------------------------

const MCP_TIMEOUT_MS = 15_000;

export async function checkMcpHealth(): Promise<HealthCheckResult | null> {
  const gatewayUrl = process.env.MCP_GATEWAY_URL;
  const gatewayKey = process.env.MCP_GATEWAY_KEY;
  if (!gatewayUrl || !gatewayKey) return null;

  const start = Date.now();
  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `dg-mcp-${Date.now()}`,
        method: "tools/call",
        params: {
          name: "check-http-health",
          arguments: {},
        },
      }),
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        target: `mcp:${gatewayUrl}`,
        status: "warn",
        latencyMs,
        detail: { httpStatus: response.status, source: "mcp-gateway" },
      };
    }

    const body = (await response.json()) as {
      result?: { healthy?: boolean; details?: Record<string, unknown> };
    };
    const healthy = body?.result?.healthy ?? true;

    return {
      target: `mcp:${gatewayUrl}`,
      status: healthy ? "allow" : "warn",
      latencyMs,
      detail: { source: "mcp-gateway", ...body?.result?.details },
    };
  } catch (error) {
    return {
      target: `mcp:${gatewayUrl}`,
      status: "warn",
      latencyMs: Date.now() - start,
      detail: { error: String(error), source: "mcp-gateway" },
    };
  }
}

// ---------------------------------------------------------------------------
// Health check (Vercel Deployment Status)
// ---------------------------------------------------------------------------

const VERCEL_TIMEOUT_MS = 10_000;

export async function checkVercelHealth(): Promise<HealthCheckResult | null> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;

  const start = Date.now();
  try {
    const url = `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        target: "vercel:production",
        status: "warn",
        latencyMs,
        detail: { httpStatus: response.status, source: "vercel" },
      };
    }

    const body = (await response.json()) as {
      deployments?: Array<{ readyState?: string; url?: string }>;
    };
    const deployment = body?.deployments?.[0];
    if (!deployment) {
      return {
        target: "vercel:production",
        status: "warn",
        latencyMs,
        detail: { source: "vercel", reason: "no deployments found" },
      };
    }

    const state = deployment.readyState;
    let status: GateDecision;
    if (state === "READY") {
      status = "allow";
    } else if (state === "ERROR" || state === "CANCELED") {
      status = "block";
    } else {
      status = "warn";
    }

    return {
      target: "vercel:production",
      status,
      latencyMs,
      detail: { source: "vercel", readyState: state, url: deployment.url },
    };
  } catch (error) {
    return {
      target: "vercel:production",
      status: "warn",
      latencyMs: Date.now() - start,
      detail: { error: String(error), source: "vercel" },
    };
  }
}

// ---------------------------------------------------------------------------
// Health check (Supabase REST)
// ---------------------------------------------------------------------------

const SUPABASE_TIMEOUT_MS = 10_000;

export async function checkSupabaseHealth(): Promise<HealthCheckResult | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const start = Date.now();
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;

    return {
      target: "supabase:rest",
      status: response.ok ? "allow" : "warn",
      latencyMs,
      detail: { httpStatus: response.status, source: "supabase" },
    };
  } catch (error) {
    return {
      target: "supabase:rest",
      status: "warn",
      latencyMs: Date.now() - start,
      detail: { error: String(error), source: "supabase" },
    };
  }
}

// ---------------------------------------------------------------------------
// Health score aggregation
// ---------------------------------------------------------------------------

function healthCheckToScore(check: HealthCheckResult): number {
  switch (check.status) {
    case "allow":
      return 100;
    case "warn":
      return 50;
    case "block":
      return 0;
    default: {
      const _exhaustive: never = check.status;
      throw new Error(`Unknown health status: ${_exhaustive}`);
    }
  }
}

function aggregateHealthScore(checks: HealthCheckResult[]): number {
  if (checks.length === 0) return 100;
  const total = checks.reduce((sum, c) => sum + healthCheckToScore(c), 0);
  return Math.round(total / checks.length);
}

// ---------------------------------------------------------------------------
// Remote gate API (enrichment layer, fail-open)
// ---------------------------------------------------------------------------

const API_TIMEOUT_MS = 15_000;

async function callGateApi(
  config: TrailheadConfig,
  localEvaluation: GateEvaluation,
): Promise<GateApiResponse | null> {
  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        commitSha: localEvaluation.commitSha,
        prNumber: localEvaluation.prNumber,
        repoId: localEvaluation.repoId,
        riskThreshold: config.riskThreshold,
        localEvaluation,
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!response.ok) {
      core.debug(
        `Gate API returned ${response.status} — falling back to local evaluation`,
      );
      return null;
    }

    const body: unknown = await response.json();
    const parsed = GateApiResponseSchema.safeParse(body);
    if (!parsed.success) {
      core.debug(`Gate API returned invalid response — ${parsed.error.message}`);
      return null;
    }
    return parsed.data;
  } catch (error) {
    core.debug(`Gate API unreachable — falling back to local evaluation: ${error}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// PR context for v4 context matching
// ---------------------------------------------------------------------------

export interface EvaluationPrMetadata {
  baseRef: string;
  headRef: string;
  labels: string[];
  authorLogin?: string;
}

function getPrMatchContext(metadata?: EvaluationPrMetadata): PrMatchContext {
  const pr = github.context.payload?.pull_request as
    | {
        base?: { ref?: string };
        head?: { ref?: string };
        labels?: Array<{ name?: string }>;
      }
    | undefined;

  return {
    baseRef:
      metadata?.baseRef ??
      pr?.base?.ref ??
      github.context.ref?.replace("refs/heads/", "") ??
      "main",
    headRef:
      metadata?.headRef ??
      pr?.head?.ref ??
      github.context.ref?.replace("refs/heads/", "") ??
      "main",
    labels:
      metadata?.labels ?? (pr?.labels ?? []).map((l) => l.name ?? "").filter(Boolean),
  };
}

async function fetchPrCommentsForOverride(
  prNumber: number,
  token: string,
): Promise<Array<{ body: string; author?: string }>> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    return comments.map((comment) => ({
      body: comment.body ?? "",
      author: comment.user?.login ?? undefined,
    }));
  } catch (error) {
    core.debug(`Failed to fetch PR comments for override: ${error}`);
    return [];
  }
}

async function applyLabelOverrideIfNeeded(input: {
  evaluation: GateEvaluation;
  config: TrailheadConfig;
  repoConfig: RepoConfig | null;
  prMatchCtx: PrMatchContext;
  prNumber: number;
  releaseResult: ReturnType<typeof computeReleaseReady>;
  gateDecision: GateDecision;
  githubToken: string;
}): Promise<GateEvaluation> {
  const overrideSettings = input.repoConfig?.override ?? {
    enabled: true,
    max_per_week: 5,
    scope: "full" as const,
  };

  const comments = await fetchPrCommentsForOverride(input.prNumber, input.githubToken);
  const recentOverrideCount = await countRecentLabelOverrides({
    repoId: input.evaluation.repoId,
    storeUrl: input.config.evaluationStoreUrl,
    apiKey: input.config.trailheadApiKey,
  });
  if (recentOverrideCount === null) {
    core.warning(
      "Could not verify weekly override cap — proceeding without cap enforcement.",
    );
  }

  const outcome = resolveLabelOverride({
    labels: input.prMatchCtx.labels,
    comments,
    config: {
      enabled: overrideSettings.enabled,
      maxPerWeek: overrideSettings.max_per_week,
      scope: overrideSettings.scope,
    },
    recentOverrideCount,
    releaseResult: input.releaseResult,
    gateDecision: input.gateDecision,
    prNumber: input.prNumber,
    ci: input.evaluation.ci,
  });

  if (outcome.kind === "applied") {
    const applied = applyLabelOverrideToEvaluation(input.evaluation, outcome.audit);
    const retained = applied.policyOverride?.retainedReasons ?? [];
    // ADR-011 §3: a risk_only override never clears mechanical blocking inputs —
    // say so, otherwise the warning reads as a full bypass that it is not.
    const retainedNote =
      retained.length > 0
        ? ` — ${retained.length} mechanical CI reason(s) still blocking`
        : "";
    core.warning(
      `Label override applied by ${outcome.audit.owner} (scope ${outcome.audit.scope ?? "full"}): ` +
        `${outcome.audit.reason}${retainedNote}`,
    );
    return {
      ...applied,
      labelOverrideFeedback: {
        status: "applied",
        message: `Release override applied by \`${outcome.audit.owner}\`${retainedNote}.`,
      },
    };
  }

  if (outcome.kind === "rejected") {
    core.warning(`Label override rejected: ${outcome.message}`);
    await postOverrideRejectionComment(
      input.prNumber,
      outcome.message,
      input.githubToken,
    );
    return {
      ...input.evaluation,
      policyFindings: [...(input.evaluation.policyFindings ?? []), outcome.message],
      labelOverrideFeedback: {
        status: "rejected",
        message: outcome.message,
      },
    };
  }

  return input.evaluation;
}

// ---------------------------------------------------------------------------
// ADR-011 — input relevance, enumerated findings, Release Brief
// ---------------------------------------------------------------------------

/**
 * Annotate every CI input with its ADR-011 §2 disposition and re-roll the
 * summary counts against the *blocking* set rather than the `required` flag.
 *
 * With no `input_relevance` entries the default mapping is required -> blocking
 * and non-required -> advisory, so the blocking set is exactly the required set
 * and every count below reproduces `evaluateRequiredChecks` verbatim. Semantics
 * only move when a policy entry matches.
 */
/** Budget for the brief inside a report that also becomes a check-run summary. */
const BRIEF_MAX_CHARS = 20000;

export function applyInputRelevance(
  summary: CiSummary,
  entries: InputRelevanceEntry[],
): CiSummary {
  const resolved = resolveDispositions(summary.checks, entries);
  const checks: CiCheck[] = summary.checks.map((check) => {
    const disposition = resolved.get(check.name);
    return disposition ? { ...check, disposition } : check;
  });
  const blocking = checks.filter(
    (check) =>
      check.disposition !== undefined &&
      dispositionCountsTowardBlocking(check.disposition),
  );

  return {
    checks,
    allRequiredPassed: blocking.every(
      (check) => check.status === "pass" || check.status === "skip",
    ),
    pendingCount: blocking.filter((check) => check.status === "pending").length,
    failedCount: blocking.filter(
      (check) =>
        check.status === "fail" || check.status === "missing" || check.status === "stale",
    ).length,
    missingCount: blocking.filter((check) => check.status === "missing").length,
  };
}

/**
 * Detector messages are authored as `<file>: <message>`. Split them so the brief
 * can carry the file as evidence; anything that does not look like a path prefix
 * stays a whole title (never guess evidence that is not there).
 */
function splitDetectorMessage(message: string): { title: string; evidence?: string } {
  const separator = message.indexOf(": ");
  if (separator > 0) {
    const head = message.slice(0, separator);
    if (/[/.]/.test(head) && !/\s/.test(head)) {
      return { title: message.slice(separator + 2).trim(), evidence: head };
    }
  }
  return { title: message };
}

/**
 * ADR-011 §1: "findings are enumerated, never counted" — the Case A fix. Every
 * detector already returns its patterns as strings; this turns them into
 * addressable findings instead of a `.length`.
 */
export function enumerateDetectorFindings(
  idPrefix: string,
  messages: string[],
  severity: RemediationSeverity,
): BriefFinding[] {
  return messages.map((message, index) => {
    const { title, evidence } = splitDetectorMessage(message);
    return {
      id: `${idPrefix}/${index + 1}`,
      title,
      severity,
      ...(evidence ? { evidence } : {}),
    };
  });
}

function briefVerdict(evaluation: GateEvaluation): BriefVerdict {
  const mode = evaluation.gateMode ?? "risk-only";
  if (mode === "release-ready" || mode === "advisory") {
    if (evaluation.releaseReady === false) return "block";
    return evaluation.gateDecision === "warn" ? "warn" : "allow";
  }
  return evaluation.gateDecision;
}

function briefTopMovers(
  factors: RiskFactor[],
): Array<{ factor: string; score: number }> | undefined {
  const movers = [...factors]
    .filter((factor) => factor.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((factor) => ({ factor: factor.type, score: factor.score }));
  return movers.length > 0 ? movers : undefined;
}

/**
 * ADR-011 §1's `delta`. Two independent sources, either of which may be absent:
 * the id-diff against the previous stored evaluation (verdict/risk/findings), and
 * the remediation loop's own fix bookkeeping. A missing or unreachable previous
 * evaluation omits the delta — it never errors.
 */
function briefDelta(
  evaluation: GateEvaluation,
  previous?: PreviousEvaluationSnapshot | null,
): string | undefined {
  const parts = [
    previous
      ? formatEvaluationDelta(
          {
            ...(previous.gateDecision !== undefined
              ? { verdict: previous.gateDecision }
              : {}),
            ...(previous.riskScore !== undefined
              ? { riskScore: previous.riskScore }
              : {}),
            ...(previous.findingIds !== undefined
              ? { findingIds: previous.findingIds }
              : {}),
          },
          {
            verdict: evaluation.gateDecision,
            riskScore: evaluation.riskScore,
            ...(evaluation.enumeratedFindings !== undefined
              ? { findingIds: evaluation.enumeratedFindings.map((f) => f.id) }
              : {}),
          },
        )
      : undefined,
    briefRemediationDelta(evaluation),
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function briefRemediationDelta(evaluation: GateEvaluation): string | undefined {
  const remediation = evaluation.remediation;
  if (!remediation?.previous_evaluation_id) return undefined;
  const parts: string[] = [];
  if (remediation.fixes_resolved.length > 0) {
    parts.push(`resolved: ${remediation.fixes_resolved.join(", ")}`);
  }
  if (remediation.fixes_introduced.length > 0) {
    parts.push(`introduced: ${remediation.fixes_introduced.join(", ")}`);
  }
  if (parts.length === 0) parts.push("no change in findings");
  return `round ${remediation.loop_round} vs previous evaluation — ${parts.join("; ")}`;
}

function briefActions(
  evaluation: GateEvaluation,
  findings: BriefFinding[],
  riskThreshold?: number,
): BriefAction[] {
  const actions: BriefAction[] = [];

  for (const check of evaluation.ci?.checks ?? []) {
    if (!checkCountsTowardBlocking(check)) continue;
    if (
      check.status !== "fail" &&
      check.status !== "missing" &&
      check.status !== "stale"
    ) {
      continue;
    }
    actions.push({
      kind: "fix",
      detail:
        `CI input "${check.name}" is ${check.status.toUpperCase()} — fix it, or ` +
        `classify it under \`contexts[].input_relevance\` if it is irrelevant to this branch pair.`,
      ...(check.detailsUrl ? { link: check.detailsUrl } : {}),
    });
  }

  for (const finding of findings) {
    if (finding.severity !== "blocking") continue;
    actions.push({ kind: "fix", detail: `${finding.title} (\`${finding.id}\`)` });
  }

  const pending = evaluation.ci?.pendingCount ?? 0;
  if (pending > 0) {
    actions.push({
      kind: "wait",
      detail: `${pending} blocking CI check(s) still pending — the gate re-evaluates when they finish.`,
    });
  }

  if (
    riskThreshold !== undefined &&
    evaluation.riskScore > riskThreshold &&
    !evaluation.policyOverride
  ) {
    actions.push({
      kind: "override",
      detail:
        `Risk ${evaluation.riskScore} exceeds threshold ${riskThreshold}. To accept it on ` +
        `the record, add the \`${OVERRIDE_LABEL}\` label and comment ` +
        `\`${OVERRIDE_LABEL}: <rationale>\` on this PR.`,
    });
  }

  return actions;
}

/**
 * Project a GateEvaluation onto ADR-011 §1's Release Brief. Pure — no I/O, no
 * mutation — so it can be rebuilt from any stored evaluation.
 */
export function buildReleaseBrief(
  evaluation: GateEvaluation,
  riskThreshold?: number,
  cannotEvaluateReason?: string,
  previous?: PreviousEvaluationSnapshot | null,
): ReleaseBrief {
  const findings = evaluation.enumeratedFindings ?? [];
  const override = evaluation.policyOverride;
  const delta = briefDelta(evaluation, previous);

  return {
    verdict: cannotEvaluateReason ? "cannot_evaluate" : briefVerdict(evaluation),
    riskScore: evaluation.riskScore,
    ...(riskThreshold !== undefined ? { riskThreshold } : {}),
    ...(briefTopMovers(evaluation.riskFactors)
      ? { topMovers: briefTopMovers(evaluation.riskFactors) }
      : {}),
    findings,
    // Every input gets a row, including the ones that did not count (ADR-011 §1).
    inputs: (evaluation.ci?.checks ?? []).map((check) => ({
      checkName: check.name,
      status: check.status,
      disposition: check.disposition?.kind ?? (check.required ? "blocking" : "advisory"),
      ...(check.disposition?.reason ? { reason: check.disposition.reason } : {}),
    })),
    ...(delta ? { delta } : {}),
    actions: briefActions(evaluation, findings, riskThreshold),
    // ADR-011 §3 maps the audit's {owner, appliedAt, reason} onto {by, at, rationale}.
    override: override
      ? {
          by: override.owner,
          at: override.appliedAt,
          scope: override.scope ?? "full",
          rationale: override.reason,
        }
      : null,
    ...(cannotEvaluateReason ? { cannotEvaluateReason } : {}),
  };
}

// ---------------------------------------------------------------------------
// ADR-011 §4 — availability stance
// ---------------------------------------------------------------------------

// The stance belongs to the matched context, which is only known *inside*
// evaluateGate — but it has to be readable by main.ts's top-level catch, i.e.
// after evaluateGate has already thrown. Stashing it here avoids loading and
// re-matching the repo config a second time just to answer "open or closed?".
let lastAvailabilityStance: AvailabilityStance | null = null;

/**
 * The availability stance of the context the most recent evaluation matched, or
 * null when no context matched (or the run failed before matching). Null means
 * "no per-context stance" — the caller keeps its action-input fail-mode.
 */
export function getResolvedAvailabilityStance(): AvailabilityStance | null {
  return lastAvailabilityStance;
}

/** Test seam, and the reset evaluateGate performs on entry. */
export function setResolvedAvailabilityStance(stance: AvailabilityStance | null): void {
  lastAvailabilityStance = stance;
}

/**
 * ADR-011 §1: "silence is a bug." When the evaluation could not run at all there is
 * no GateEvaluation to project, so the brief is built from the failure itself.
 */
export function buildCannotEvaluateBrief(
  reason: string,
  stance: AvailabilityStance,
): ReleaseBrief {
  const actions: BriefAction[] = [
    {
      kind: "fix",
      detail:
        "Resolve the failure above and re-run the Trailhead job. Until it runs, no " +
        "risk score, no input dispositions and no findings exist for this commit.",
    },
    stance === "fail_closed"
      ? {
          kind: "wait",
          detail:
            "Availability stance is fail_closed: no verdict means no merge. Break-glass " +
            "is a GitHub admin merge — visible and extraordinary, and it records nothing.",
        }
      : {
          kind: "wait",
          detail:
            "Availability stance is fail_open: this run did not block the merge, but no " +
            "Trailhead verdict was recorded for this commit.",
        },
  ];

  return {
    verdict: "cannot_evaluate",
    findings: [],
    inputs: [],
    actions,
    override: null,
    cannotEvaluateReason: reason,
  };
}

// ---------------------------------------------------------------------------
// Main evaluation entry point
// ---------------------------------------------------------------------------

export async function evaluateGate(
  config: TrailheadConfig,
  commitSha: string,
  prNumber?: number,
  prMetadata?: EvaluationPrMetadata,
): Promise<GateEvaluation> {
  const start = Date.now();
  // Nothing is known about this run's availability stance until a context matches.
  setResolvedAvailabilityStance(null);
  const prMatchCtx = getPrMatchContext(prMetadata);

  const isMergeQueue =
    github.context.eventName === "merge_group" ||
    prMatchCtx.labels.some((label) => label === "queue" || label.includes("merge-queue"));

  if (isMergeQueue) {
    core.info("Merge queue detected — adjusting evaluation (skipping author_history)");
  }

  const [files, repoConfig] = await Promise.all([
    prNumber ? fetchPrFiles(prNumber, config.githubToken) : Promise.resolve([]),
    loadRepoConfig(config.githubToken),
  ]);
  const submissionMode = repoConfig?.submission?.mode ?? "block";
  const submissionEnabled =
    config.submissionGate === true || repoConfig?.submission?.enabled === true;
  if (submissionEnabled && config.githubToken) {
    const octokit = github.getOctokit(config.githubToken);
    const { owner, repo } = github.context.repo;
    await hydrateChangedRouteContents(octokit, owner, repo, commitSha, files);
  }
  const changedFiles = files.map((f) => f.filename);

  const [
    authorFactor,
    prAgeFactor,
    provenance,
    httpHealthChecks,
    vercelCheck,
    supabaseCheck,
    mcpCheck,
    securityAlerts,
  ] = await Promise.all([
    prNumber && config.githubToken && !isMergeQueue
      ? computeAuthorHistory(prNumber, config.githubToken)
      : Promise.resolve(null),
    prNumber && config.githubToken
      ? computePrAge(prNumber, config.githubToken)
      : Promise.resolve(null),
    prNumber && config.githubToken
      ? detectPrProvenance(prNumber, config.githubToken)
      : Promise.resolve(null),
    config.healthCheckUrls.length > 0
      ? Promise.all(config.healthCheckUrls.map((url) => checkHealth(url)))
      : Promise.resolve([]),
    checkVercelHealth(),
    checkSupabaseHealth(),
    checkMcpHealth(),
    config.securityGate !== false && config.githubToken
      ? fetchCodeScanningAlerts(config.githubToken, repoConfig?.security, {
          changedFiles: prNumber ? changedFiles : undefined,
        })
      : Promise.resolve(null),
  ]);

  const gateMode: GateMode = resolveGateMode(
    repoConfig?.gate?.mode,
    repoConfig?.schema_version ?? 1,
    config.gateMode,
  );
  const matchedContext =
    repoConfig?.contexts && repoConfig.contexts.length > 0
      ? matchContext(repoConfig.contexts, prMatchCtx)
      : null;

  if (matchedContext) {
    core.info(
      `Matched context "${matchedContext.matched.name}" for base=${prMatchCtx.baseRef}`,
    );
  }

  // ADR-011 §4 — a per-branch-pair stance overrides the action-input fail-mode.
  const availabilityStance = matchedContext?.context.availability ?? null;
  setResolvedAvailabilityStance(availabilityStance);
  if (availabilityStance) {
    core.info(
      `Availability stance: ${availabilityStance} (context "${matchedContext?.matched.name}")`,
    );
  }

  const effectiveEnvironment =
    config.environment ?? matchedContext?.matched.environment ?? undefined;

  const envConfig = effectiveEnvironment
    ? repoConfig?.environments?.[effectiveEnvironment]
    : undefined;

  const contextThresholds = matchedContext?.context.thresholds;
  const effectiveRiskThreshold =
    contextThresholds?.risk ??
    envConfig?.risk ??
    repoConfig?.thresholds.risk ??
    config.riskThreshold;
  const effectiveWarnThreshold =
    contextThresholds?.warn ??
    envConfig?.warn ??
    repoConfig?.thresholds.warn ??
    config.warnThreshold;
  let adjustedRiskThreshold = effectiveRiskThreshold;
  const policyFindings: string[] = [];

  const freezeCheck = isInFreezeWindow(repoConfig?.freeze ?? []);
  if (freezeCheck.frozen) {
    core.warning(`Release freeze active: ${freezeCheck.message}`);
  }

  const scoringRiskConfig = riskConfigFromRepo(repoConfig);
  const { score: localRiskScore, factors: riskFactors } = computeRiskScore(
    files,
    repoConfig,
  );

  if (authorFactor) riskFactors.push(authorFactor);
  if (prAgeFactor) riskFactors.push(prAgeFactor);

  const depFactor = detectDependencyChanges(files) as RiskFactor | null;
  if (depFactor) riskFactors.push(depFactor);

  if (securityAlerts && securityAlerts.total > 0) {
    const secFactor = computeSecurityRiskFactor(
      securityAlerts,
      repoConfig?.security,
    ) as RiskFactor | null;
    if (secFactor) riskFactors.push(secFactor);
  }

  const fileNames = files.map((f) => f.filename);
  const matchedProfile = matchRiskProfile(fileNames, repoConfig?.profiles ?? []);
  const customWeights = {
    ...(repoConfig?.weights ?? {}),
    ...(matchedProfile?.weights ?? {}),
  };
  if (matchedProfile) {
    const label = matchedProfile.name ?? "unnamed";
    core.info(
      `Risk profile "${label}" matched — weight overrides applied: ${JSON.stringify(matchedProfile.weights)}`,
    );
    policyFindings.push(
      `Risk profile "${label}" matched (${Object.entries(matchedProfile.weights)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}).`,
    );
  }
  const ciIntegrityConfig = repoConfig?.policies?.ci_integrity;
  const ciIntegrity =
    ciIntegrityConfig?.enabled === false
      ? { factor: null, blockingPatterns: [], warningSignals: [] }
      : detectCiIntegrityRisk(files);
  if (ciIntegrity.factor) {
    riskFactors.push(ciIntegrity.factor);
  }
  const workflowSecurityConfig = repoConfig?.policies?.workflow_security;
  const workflowSecurity =
    workflowSecurityConfig?.enabled === false
      ? { factor: null, blockingPatterns: [], warnings: [] }
      : detectWorkflowSecurityRisk(
          files,
          workflowSecurityConfig?.allow_unpinned_actions ?? [],
        );
  if (workflowSecurity.factor) {
    riskFactors.push(workflowSecurity.factor);
  }
  const promptInjectionConfig = repoConfig?.policies?.prompt_injection;
  const promptInjection =
    promptInjectionConfig?.enabled === false
      ? { factor: null, blockingPatterns: [], warnings: [] }
      : detectPromptInjectionRisk(files);
  if (promptInjection.factor) {
    riskFactors.push(promptInjection.factor);
  }
  const supplyChainConfig = repoConfig?.policies?.supply_chain;
  const supplyChain =
    supplyChainConfig?.enabled === false
      ? {
          factor: null,
          blockingPatterns: [],
          warnings: [],
          criticalVulnDetected: false,
        }
      : detectSupplyChainRisk(files);
  if (supplyChain.factor) {
    if (
      supplyChain.criticalVulnDetected &&
      supplyChain.factor.score < (supplyChainConfig?.force_score_on_critical ?? 80)
    ) {
      supplyChain.factor.score = supplyChainConfig?.force_score_on_critical ?? 80;
      supplyChain.factor.detail = {
        ...supplyChain.factor.detail,
        critical_floor_applied: supplyChain.factor.score,
      };
    }
    riskFactors.push(supplyChain.factor);
  }
  const prScope = await detectPrScopeRisk({
    files,
    repoConfig,
    prNumber,
    token: config.githubToken,
    provenance,
    headRef: prMatchCtx.headRef,
    baseRef: prMatchCtx.baseRef,
  });
  if (prScope.factor) {
    riskFactors.push(prScope.factor);
  }
  const duplicateLogicConfig = repoConfig?.policies?.duplicate_logic;
  const duplicateLogic =
    duplicateLogicConfig?.enabled === false
      ? { factor: null, findings: [] }
      : detectDuplicateLogicRisk(files);
  if (duplicateLogic.factor) {
    riskFactors.push(duplicateLogic.factor);
  }
  const crossRepoRegistryPath =
    repoConfig?.policies?.cross_repo_impact?.consumer_registry_path;
  const externalConsumerRegistry = crossRepoRegistryPath
    ? loadConsumerRegistryFile(crossRepoRegistryPath)
    : null;
  const crossRepoImpact = detectCrossRepoImpact(
    files,
    repoConfig,
    externalConsumerRegistry,
  );
  if (crossRepoImpact.factor) {
    riskFactors.push(crossRepoImpact.factor);
  }
  const splitRiskFactors = splitSizeFactors(
    riskFactors as RiskFactorResult[],
    scoringRiskConfig,
  );
  const sizeFactors = splitRiskFactors.sizeFactors as RiskFactor[];
  const scoreFactors = splitRiskFactors.sizeFactorsAsMetadata
    ? (splitRiskFactors.riskFactors as RiskFactor[])
    : riskFactors;
  const sizeScore =
    sizeFactors.length > 0
      ? weightedAverageScores(sizeFactors as RiskFactorResult[], customWeights)
      : undefined;
  if (splitRiskFactors.sizeFactorsAsMetadata && sizeFactors.length > 0) {
    policyFindings.push(
      `Size factors reported separately from blocking risk average (${sizeFactors
        .map((factor) => `${factor.type}=${factor.score}`)
        .join(", ")}).`,
    );
  }
  const riskScore =
    scoreFactors.length > 0
      ? weightedAverageScores(scoreFactors as RiskFactorResult[], customWeights)
      : splitRiskFactors.sizeFactorsAsMetadata
        ? 0
        : localRiskScore;

  // GATE-3: Apply severity-based penalties to risk factors. Opt-in via
  // policies.risk_factor_severity.enabled — an always-on penalty would shift
  // every repo's scores mid-calibration, making block-rate movement
  // unattributable to config vs release drift.
  const severityPenaltiesCfg = repoConfig?.policies?.risk_factor_severity;
  const severityPenaltiesEnabled = severityPenaltiesCfg?.enabled === true;
  const severityPenalties = {
    critical: severityPenaltiesCfg?.critical ?? 10,
    high: severityPenaltiesCfg?.high ?? 5,
    medium: severityPenaltiesCfg?.medium ?? 2,
    low: severityPenaltiesCfg?.low ?? 1,
  };

  const { adjustedScore: riskScoreWithPenalties, appliedPenalties } =
    severityPenaltiesEnabled
      ? applyRiskFactorSeverityPenalties(riskScore, scoreFactors, severityPenalties)
      : { adjustedScore: riskScore, appliedPenalties: 0 };

  if (appliedPenalties > 0) {
    core.info(
      `GATE-3: Applied ${appliedPenalties} points of severity penalties to risk score (${riskScore} -> ${riskScoreWithPenalties})`,
    );
  }

  const agentPolicy = await enforceAgentPrPolicies({
    prNumber,
    token: config.githubToken,
    files,
    repoConfig,
    provenance,
    currentRiskThreshold: adjustedRiskThreshold,
    matchedContextName: matchedContext?.matched.name,
    headSha: commitSha,
    prAuthorLogin: prMetadata
      ? prMetadata.authorLogin
      : (
          github.context.payload?.pull_request as
            | { user?: { login?: string } }
            | undefined
        )?.user?.login,
  });
  if (agentPolicy?.adjustedRiskThreshold !== undefined) {
    adjustedRiskThreshold = agentPolicy.adjustedRiskThreshold;
  }
  if (agentPolicy?.findings.length) {
    policyFindings.push(...agentPolicy.findings);
  }

  let submissionChecks: SubmissionCheckResult[] = [];
  if (submissionEnabled && files.length > 0) {
    for (const warning of getSubmissionConfigWarnings(repoConfig?.submission)) {
      core.warning(warning);
    }
    // contract_integrity (ADR-010): load the org catalog index, if configured,
    // so cross-repo contract references can resolve (else they stay advisory).
    let catalogKnownEntities: string[] | undefined;
    const catalogIndexPath =
      repoConfig?.submission?.contract_integrity?.catalog_index_path;
    if (catalogIndexPath) {
      try {
        catalogKnownEntities = loadCatalogIndex(catalogIndexPath);
      } catch (err) {
        core.warning(
          `contract_integrity: could not load catalog index "${catalogIndexPath}": ${
            (err as Error).message
          }`,
        );
      }
    }
    // import_resolution ground truth: the full repo file list lets relative
    // imports resolve to existing, unchanged siblings (not just changed files),
    // killing the false-positive block. Undefined → that detector stays dormant.
    const repoPaths = prNumber
      ? await fetchRepoPaths(prNumber, config.githubToken)
      : undefined;
    submissionChecks = runSubmissionGate({
      files: files.map((f) => ({
        filename: f.filename,
        patch: f.patch,
        status: f.status,
        content: f.content,
        additions: f.additions,
      })),
      repoConfig,
      komatikInstance: process.env.KOMATIK_INSTANCE === "true",
      agentRepo: process.env.AGENT_SUGGESTIONS_REPO || undefined,
      mode: submissionMode,
      declaredPackages: parseDeclaredPackages(process.env.TRAILHEAD_DECLARED_PACKAGES),
      catalogKnownEntities,
      repoPaths,
      // promotion_coherence (ADR-010): use the fetched PR topology for
      // evaluate-pr backfills, with the event-derived context as the normal path.
      promotion:
        prMetadata || process.env.GITHUB_BASE_REF || process.env.GITHUB_HEAD_REF
          ? {
              baseBranch: prMatchCtx.baseRef,
              headBranch: prMatchCtx.headRef,
            }
          : undefined,
      // close_on_ship_link: the PR body carries the `Closes task: <id>` convention.
      prBody:
        (github.context.payload?.pull_request as { body?: string } | undefined)?.body ??
        undefined,
    });
    if (submissionChecks.length > 0) {
      policyFindings.push(`Submission gate: ${submissionChecks.length} finding(s).`);
    }
  }

  const sessionCorrelation = await detectSessionCorrelation({
    prNumber,
    token: config.githubToken,
    provenance,
    repoConfig,
  });
  const sessionCfg = repoConfig?.policies?.session_correlation;
  // Kept as its own list so ADR-011 §1 can enumerate the burst instead of
  // burying it in the undifferentiated policyFindings prose.
  const sessionCorrelationFindings: string[] = [];
  if (sessionCorrelation && sessionCfg) {
    const threshold = sessionCfg.threshold;
    if (sessionCorrelation.burstCount >= threshold) {
      sessionCorrelationFindings.push(
        `Rapid-fire merge burst detected: ${sessionCorrelation.burstCount} merged PRs in ${sessionCorrelation.windowMinutes} minutes.`,
      );
      if (sessionCfg.mode === "block") {
        sessionCorrelationFindings.push(
          "Session correlation policy is configured to block.",
        );
      }
      policyFindings.push(...sessionCorrelationFindings);
    }
  }

  const healthChecks: HealthCheckResult[] = [...httpHealthChecks];
  if (vercelCheck) healthChecks.push(vercelCheck);
  if (supabaseCheck) healthChecks.push(supabaseCheck);
  if (mcpCheck) healthChecks.push(mcpCheck);

  const healthScore = aggregateHealthScore(healthChecks);
  // GATE-3: Use riskScoreWithPenalties for gate decision
  const baselineDecision = freezeCheck.frozen
    ? ("block" as GateDecision)
    : (decideGate(
        riskScoreWithPenalties,
        healthScore,
        adjustedRiskThreshold,
        effectiveWarnThreshold,
      ) as GateDecision);
  // GATE-3 (2b): critical sensitive_files change escalates out of the risk average.
  const sensitiveEscalation = decideSensitiveFilesEscalation(
    riskFactors,
    repoConfig?.policies?.sensitive_files,
  );
  if (sensitiveEscalation.reason) policyFindings.push(sensitiveEscalation.reason);

  const sessionCorrelationBlocks =
    sessionCorrelation !== null &&
    sessionCfg !== undefined &&
    sessionCorrelation.burstCount >= sessionCfg.threshold &&
    sessionCfg.mode === "block";
  const submissionBlocks =
    submissionChecks.length > 0 &&
    submissionGateShouldBlock(submissionChecks, submissionMode);

  const gateDecision =
    agentPolicy?.forceBlock === true ||
    sensitiveEscalation.block ||
    (ciIntegrity.blockingPatterns.length > 0 &&
      (ciIntegrityConfig?.mode ?? "block") === "block") ||
    (workflowSecurity.blockingPatterns.length > 0 &&
      (workflowSecurityConfig?.mode ?? "block") === "block") ||
    (promptInjection.blockingPatterns.length > 0 &&
      (promptInjectionConfig?.mode ?? "block") === "block") ||
    ((supplyChain.blockingPatterns.length > 0 || supplyChain.criticalVulnDetected) &&
      (supplyChainConfig?.mode ?? "warn") === "block") ||
    (prScope.forceBlock && prScope.findings.length > 0) ||
    ((duplicateLogic.factor?.score ?? 0) >= 60 &&
      (duplicateLogicConfig?.mode ?? "warn") === "block") ||
    ((crossRepoImpact.factor?.score ?? 0) >= 60 &&
      (repoConfig?.policies?.cross_repo_impact?.mode ?? "warn") === "block") ||
    sessionCorrelationBlocks ||
    submissionBlocks
      ? ("block" as GateDecision)
      : sensitiveEscalation.warn && baselineDecision === "allow"
        ? ("warn" as GateDecision)
        : baselineDecision;

  // ADR-011 §1 (Case A): the count-strings below stay for existing consumers, but
  // the individual patterns are now carried through to the evaluation so the
  // Release Brief can enumerate them instead of printing a bare number.
  const enumeratedFindings: BriefFinding[] = [
    ...enumerateDetectorFindings(
      "ci_integrity",
      ciIntegrity.blockingPatterns,
      "blocking",
    ),
    ...enumerateDetectorFindings(
      "ci_integrity_warning",
      ciIntegrity.warningSignals,
      "warn",
    ),
    ...enumerateDetectorFindings(
      "workflow_security",
      workflowSecurity.blockingPatterns,
      "blocking",
    ),
    ...enumerateDetectorFindings(
      "workflow_security_warning",
      workflowSecurity.warnings,
      "warn",
    ),
    ...enumerateDetectorFindings(
      "prompt_injection",
      promptInjection.blockingPatterns,
      "blocking",
    ),
    ...enumerateDetectorFindings(
      "prompt_injection_warning",
      promptInjection.warnings,
      "warn",
    ),
    ...enumerateDetectorFindings(
      "supply_chain",
      supplyChain.blockingPatterns,
      "blocking",
    ),
    ...enumerateDetectorFindings("supply_chain_warning", supplyChain.warnings, "warn"),
    ...enumerateDetectorFindings("pr_scope", prScope.findings, "advisory"),
    ...enumerateDetectorFindings("duplicate_logic", duplicateLogic.findings, "advisory"),
    ...enumerateDetectorFindings(
      "cross_repo_impact",
      crossRepoImpact.findings,
      "advisory",
    ),
    // The four block-capable sources below are not detector pattern lists, so
    // they used to reach the evaluation as prose in `policyFindings` only. A
    // BLOCK caused by any of them would then render as "No findings." — the
    // exact silence ADR-011 §1 forbids.
    ...enumerateDetectorFindings(
      "agent_policy",
      agentPolicy?.findings ?? [],
      agentPolicy?.forceBlock === true ? "blocking" : "warn",
    ),
    ...enumerateDetectorFindings(
      "agent_policy_notice",
      agentPolicy?.notices ?? [],
      "advisory",
    ),
    // A single escalation verdict, so its id is fixed rather than enumerated.
    ...(sensitiveEscalation.reason
      ? [
          {
            id: "sensitive_files/0",
            title: sensitiveEscalation.reason,
            severity: sensitiveEscalation.block
              ? ("blocking" as const)
              : ("warn" as const),
          },
        ]
      : []),
    ...enumerateDetectorFindings(
      "session_correlation",
      sessionCorrelationFindings,
      sessionCorrelationBlocks ? "blocking" : "warn",
    ),
    // `policyFindings` only ever carried the submission count; the per-check
    // code/title/detail/severity is what a human actually needs.
    ...submissionChecks.map((check, index) => ({
      id: `submission/${check.code}/${index + 1}`,
      title: check.title,
      evidence: check.detail,
      severity: check.severity,
    })),
  ];

  if (ciIntegrity.blockingPatterns.length > 0) {
    policyFindings.push(
      `CI integrity blocking patterns detected (${ciIntegrity.blockingPatterns.length}).`,
    );
  }
  if (workflowSecurity.blockingPatterns.length > 0) {
    policyFindings.push(
      `Workflow security blocking patterns detected (${workflowSecurity.blockingPatterns.length}).`,
    );
  }
  if (workflowSecurity.warnings.length > 0) {
    policyFindings.push(
      `Workflow security warnings detected (${workflowSecurity.warnings.length}).`,
    );
  }
  if (promptInjection.blockingPatterns.length > 0) {
    policyFindings.push(
      `Prompt/command injection blocking patterns detected (${promptInjection.blockingPatterns.length}).`,
    );
  }
  if (promptInjection.warnings.length > 0) {
    policyFindings.push(
      `Prompt/command injection warnings detected (${promptInjection.warnings.length}).`,
    );
  }
  if (supplyChain.blockingPatterns.length > 0) {
    policyFindings.push(
      `Supply-chain blocking patterns detected (${supplyChain.blockingPatterns.length}).`,
    );
  }
  if (supplyChain.warnings.length > 0) {
    policyFindings.push(
      `Supply-chain warnings detected (${supplyChain.warnings.length}).`,
    );
  }
  if (prScope.findings.length > 0) {
    policyFindings.push(...prScope.findings);
  }
  if (duplicateLogic.findings.length > 0) {
    policyFindings.push(
      `Potential duplicate logic findings (${duplicateLogic.findings.length}).`,
    );
  }
  if (crossRepoImpact.findings.length > 0) {
    policyFindings.push(...crossRepoImpact.findings);
    if (crossRepoImpact.affectedConsumers.length > 0) {
      policyFindings.push(
        `Potential downstream impact for: ${crossRepoImpact.affectedConsumers.join(", ")}.`,
      );
    }
  }

  const escalationCfg = repoConfig?.escalation;
  const escalationStatus =
    gateDecision === "block" && escalationCfg
      ? {
          enabled: escalationCfg.targets.length > 0,
          target_count: escalationCfg.targets.length,
          acknowledge_sla_minutes: escalationCfg.acknowledge_sla_minutes,
          resolve_sla_minutes: escalationCfg.resolve_sla_minutes,
        }
      : undefined;
  if (escalationStatus?.enabled) {
    policyFindings.push(
      `Escalation configured with ${escalationStatus.target_count} target(s); acknowledge within ${escalationStatus.acknowledge_sla_minutes} minutes.`,
    );
  }
  const trustProfile =
    provenance?.type && provenance.type !== "human"
      ? (() => {
          const trustRuntime = readTrustRuntime();
          const metrics = trustRuntime.enabled
            ? parseAgentTrustMetrics(process.env.TRAILHEAD_AGENT_TRUST_JSON)
            : null;
          const trust = metrics ? computeAgentTrustScore(metrics) : null;

          if (trustRuntime.enabled && metrics) {
            if (trust) {
              core.info(
                `[agent-trust] profile=${trust.profile} score=${trust.score}` +
                  (trustRuntime.shadow ? " (shadow — threshold delta not applied)" : ""),
              );
              if (trustRuntime.enforce && trust.thresholdDelta !== 0) {
                adjustedRiskThreshold = Math.max(
                  0,
                  Math.min(100, adjustedRiskThreshold + trust.thresholdDelta),
                );
              }
            } else {
              core.info(
                "[agent-trust] metrics present but trust=null (cold start — insufficient evidence or flat signals)",
              );
            }
          }

          return strictnessFromTrust(trust, riskScoreWithPenalties);
        })()
      : {
          strictness: "baseline" as const,
          reason: "Human provenance or unknown automation signals",
        };

  let localEvaluation: GateEvaluation = {
    id: `dg-${commitSha.substring(0, 7)}-${Date.now()}`,
    repoId: `${github.context.repo.owner}/${github.context.repo.repo}`,
    commitSha,
    prNumber,
    healthScore,
    riskScore: riskScoreWithPenalties, // GATE-3: Use adjusted score with severity penalties
    sizeScore,
    gateDecision,
    healthChecks,
    riskFactors,
    sizeFactors: sizeFactors.length > 0 ? sizeFactors : undefined,
    files: fileNames.length > 0 ? fileNames : undefined,
    evaluationMs: Date.now() - start,
    environment: effectiveEnvironment,
    policyFindings: policyFindings.length > 0 ? policyFindings : undefined,
    enumeratedFindings: enumeratedFindings.length > 0 ? enumeratedFindings : undefined,
    pr: prNumber
      ? {
          provenance:
            provenance ??
            ({
              type: "unknown",
              confidence: 0.2,
              source: "not-detected",
            } as PrProvenance),
          headRef: prMatchCtx.headRef,
        }
      : undefined,
    session_correlation:
      sessionCorrelation && sessionCorrelation.burstCount > 0
        ? {
            burst_count: sessionCorrelation.burstCount,
            window: `${sessionCorrelation.windowMinutes}m`,
          }
        : undefined,
    escalation_status: escalationStatus,
    trust_profile: trustProfile,
    gateMode,
    context: matchedContext?.matched,
    submissionChecks: submissionChecks.length > 0 ? submissionChecks : undefined,
    cross_repo_impact:
      crossRepoImpact.services.length > 0
        ? {
            services: crossRepoImpact.services.map((service) => ({
              serviceName: service.serviceName,
              touchedFiles: service.touchedFiles,
              consumers: service.consumers.map((consumer) => ({
                id: consumer.id,
                repo: consumer.repo,
                branch: consumer.branch,
              })),
              notify_webhook: service.notify_webhook,
            })),
          }
        : undefined,
  };

  let ciSummary: CiSummary | null = null;
  if (gateMode !== "risk-only" && config.githubToken) {
    try {
      const octokit = github.getOctokit(config.githubToken);
      const { owner, repo } = github.context.repo;
      const ciConfig = matchedContext?.context.ci ?? {
        required_checks: [],
        optional_checks: [],
        missing_required: "fail" as const,
      };
      const excludeCheckNames = [
        resolveCheckName(gateMode, repoConfig?.gate?.check_name ?? config.checkName),
        "Trailhead",
        "Trailhead — Release Ready",
      ];
      const ciManifest = config.ciManifest ?? null;

      if (config.waitForChecks && ciConfig.required_checks.length > 0) {
        ciSummary = await waitForChecks({
          octokit,
          owner,
          repo,
          headSha: commitSha,
          ciConfig,
          excludeCheckNames,
          timeoutMinutes: config.waitTimeoutMinutes ?? 30,
          manifest: ciManifest,
        });
      } else {
        const checks = await fetchCheckRuns(octokit, {
          owner,
          repo,
          headSha: commitSha,
          excludeCheckNames,
        });
        ciSummary = evaluateRequiredChecks(checks, ciConfig, ciManifest);
      }
      // ADR-011 §2 — resolve each input's disposition before anything reads the
      // summary. With no input_relevance config this is a pure annotation pass.
      ciSummary = applyInputRelevance(
        ciSummary,
        matchedContext?.context.input_relevance ?? [],
      );
      localEvaluation.ci = ciSummary;
    } catch (error) {
      core.warning(`CI orchestration failed (non-blocking): ${error}`);
    }
  }

  // GATE-3 (2a): block_on_critical keys on CRITICAL severity (not raw total).
  const securityBlocked = decideSecurityBlock(securityAlerts, {
    requireSecurityClear: envConfig?.require_security_clear === true,
    blockOnCritical: repoConfig?.security?.block_on_critical === true,
  });

  const releaseResult = computeReleaseReady({
    gateMode,
    gateDecision,
    riskScore: riskScoreWithPenalties, // GATE-3: Use adjusted score
    riskThreshold: adjustedRiskThreshold,
    healthScore,
    healthChecksConfigured: healthChecks.length > 0,
    ciSummary,
    freezeActive: freezeCheck.frozen,
    freezeMessage: freezeCheck.message,
    policyFindings,
    requireSecurityClear: envConfig?.require_security_clear,
    securityBlocked,
  });
  localEvaluation = applyReleaseReadyToEvaluation(
    localEvaluation,
    releaseResult,
    gateMode,
  );

  if (prNumber && config.githubToken && hasOverrideLabel(prMatchCtx.labels)) {
    localEvaluation = await applyLabelOverrideIfNeeded({
      evaluation: localEvaluation,
      config,
      repoConfig,
      prMatchCtx,
      prNumber,
      releaseResult,
      gateDecision,
      githubToken: config.githubToken,
    });
  }

  if (config.apiKey) {
    const apiResponse = await callGateApi(config, localEvaluation);
    if (apiResponse) {
      localEvaluation = {
        ...localEvaluation,
        id: apiResponse.id ?? localEvaluation.id,
        reportUrl: apiResponse.reportUrl ?? localEvaluation.reportUrl,
        evaluationMs: Date.now() - start,
      };
    }
  }

  if (crossRepoImpact.services.length > 0) {
    await sendCrossRepoImpactWebhooks(crossRepoImpact, {
      repoId: localEvaluation.repoId,
      commitSha: localEvaluation.commitSha,
      prNumber: localEvaluation.prNumber,
    });
  }

  const remediationSettings = repoConfig?.remediation;
  const agentBriefMode = resolveAgentBriefMode({
    actionSetting: config.agentBrief,
    repoSetting: repoConfig?.gate?.agent_brief,
    provenanceType: localEvaluation.pr?.provenance?.type,
  });
  localEvaluation.agentBriefMode = agentBriefMode;

  // Fetched once, outside the remediation branch: ADR-011 §1's delta needs the
  // previous evaluation even in repos that have remediation turned off.
  let previousEvaluation: PreviousEvaluationSnapshot | null = null;
  if (prNumber && (config.evaluationStoreUrl || process.env.SUPABASE_URL)) {
    try {
      previousEvaluation = await fetchPreviousEvaluationForPr({
        repoId: localEvaluation.repoId,
        prNumber,
        excludeEvaluationId: localEvaluation.id,
        storeUrl: config.evaluationStoreUrl,
        apiKey: config.trailheadApiKey,
      });
    } catch (error) {
      core.debug(`Previous evaluation lookup failed: ${error}`);
    }
  }

  const remediationEnabled = remediationSettings?.enabled !== false;
  if (remediationEnabled) {
    localEvaluation.remediation = buildRemediation({
      evaluation: {
        id: localEvaluation.id,
        riskFactors: localEvaluation.riskFactors,
        ci: localEvaluation.ci,
        releaseReady: localEvaluation.releaseReady,
        releaseReadyReasons: localEvaluation.releaseReadyReasons,
        policyFindings: localEvaluation.policyFindings,
        gateDecision: localEvaluation.gateDecision,
      },
      previousEvaluation,
      maxLoopRounds: remediationSettings?.max_loop_rounds ?? 3,
      agentProvenance: isAgentProvenanceType(
        localEvaluation.pr?.provenance?.type ?? "unknown",
      ),
      submissionChecks,
    });
  }

  // ADR-011 §1 — built last so it sees release-readiness, the override outcome
  // and the remediation delta.
  localEvaluation.releaseBrief = buildReleaseBrief(
    localEvaluation,
    adjustedRiskThreshold,
    undefined,
    previousEvaluation,
  );

  return localEvaluation;
}

// ---------------------------------------------------------------------------
// PR comment posting
// ---------------------------------------------------------------------------

/**
 * Safety bound for anything handed to GitHub as a report body. Issue comments
 * cap at 65536 characters and a check run's `output.summary` at 65535; one
 * number under both leaves room for the comment marker.
 */
export const MAX_GATE_REPORT_CHARS = 65000;

const BRIEF_HEADING = "## Release Brief";
const BRIEF_SEPARATOR = "\n\n---\n\n";

/** Cut points that leave the surviving markdown structurally intact. */
const SECTION_BOUNDARIES = ["\n\n#", "\n\n<details>", "\n\n"];

/**
 * Clamp a gate report to what GitHub will actually accept.
 *
 * `renderReleaseBrief` already caps the brief itself, but the legacy report
 * appended below it is unbounded (the files-changed list alone grows with the
 * PR). Only that tail is trimmed — the brief is the decision, so it survives
 * intact — and the reader is told where the full detail still lives.
 */
export function clampGateReport(
  report: string,
  maxChars: number = MAX_GATE_REPORT_CHARS,
): string {
  if (report.length <= maxChars) return report;

  const notice =
    `\n\n_…report truncated (${report.length - maxChars} chars over GitHub's ` +
    `comment limit) — full detail in the stored evaluation / job summary._`;
  const budget = maxChars - notice.length;
  if (budget <= 0) return report.slice(0, maxChars);

  // Never cut into the brief: keep everything up to its trailing separator.
  const briefStart = report.indexOf(BRIEF_HEADING);
  const separator = briefStart >= 0 ? report.indexOf(BRIEF_SEPARATOR, briefStart) : -1;
  const floor = separator >= 0 ? separator + BRIEF_SEPARATOR.length : 0;
  if (floor >= budget) return `${report.slice(0, budget)}${notice}`;

  const head = report.slice(0, budget);
  let cut = budget;
  for (const boundary of SECTION_BOUNDARIES) {
    const index = head.lastIndexOf(boundary);
    if (index > floor) {
      cut = index;
      break;
    }
  }

  return `${report.slice(0, cut).trimEnd()}${notice}`;
}

export async function postOverrideRejectionComment(
  prNumber: number,
  message: string,
  token: string,
): Promise<void> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const MARKER = "<!-- trailhead-override-feedback -->";
    const body =
      `${MARKER}\n` +
      `### Trailhead override rejected\n\n` +
      `${message}\n\n` +
      `_This comment is updated automatically when the \`trailhead-override\` label is present._`;

    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    const existing = comments.find((comment) => comment.body?.includes(MARKER));

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      });
      return;
    }

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  } catch (error) {
    core.debug(`Failed to post override rejection comment: ${error}`);
  }
}

export async function postPrComment(
  report: string,
  prNumber: number,
  token: string,
): Promise<void> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    const MARKER = "<!-- trailhead-gate-report -->";
    const body = clampGateReport(`${MARKER}\n${report}`);

    const existing = comments.find((c) => c.body?.includes(MARKER));

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
    }
  } catch (error) {
    // Fail-soft, but never silent: a missing gate comment is a visible gap in
    // the record, so it belongs in the run log rather than in debug output.
    core.warning(`Failed to post PR comment: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// GitHub Check Run
// ---------------------------------------------------------------------------

export async function createCheckRun(
  evaluation: GateEvaluation,
  report: string,
  token: string,
  checkName?: string,
): Promise<void> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const mode = evaluation.gateMode ?? "risk-only";
    const name = checkName ?? resolveCheckName(mode);
    const conclusion = checkConclusionForEvaluation(evaluation);

    const titleSuffix =
      mode === "release-ready"
        ? evaluation.releaseReady
          ? "RELEASE READY"
          : "NOT READY"
        : evaluation.gateDecision.toUpperCase();

    await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: evaluation.commitSha,
      status: "completed",
      conclusion,
      output: {
        title: `${name}: ${titleSuffix}`,
        summary: clampGateReport(report),
        ...(evaluation.storePersisted === false
          ? { text: "Evaluation not persisted — dashboard incomplete." }
          : {}),
      },
    });
  } catch (error) {
    // Fail-soft, but never silent — see postPrComment.
    core.warning(`Failed to create check run: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Risk factor severity penalty application (GATE-3)
// ---------------------------------------------------------------------------

/**
 * Apply severity-based penalties to risk factors.
 * Adds penalty points for high/critical severity factors to increase overall risk score.
 */
export function applyRiskFactorSeverityPenalties(
  baseRiskScore: number,
  riskFactors: RiskFactor[],
  severityPenalties?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  },
): { adjustedScore: number; appliedPenalties: number } {
  const penalties = severityPenalties ?? { critical: 10, high: 5, medium: 2, low: 1 };
  let totalPenalty = 0;

  for (const factor of riskFactors) {
    const detail = factor.detail as Record<string, unknown> | undefined;
    const severity = detail?.["severity"] as string | undefined;

    if (severity) {
      const penaltyValue =
        severity === "critical"
          ? (penalties.critical ?? 10)
          : severity === "high"
            ? (penalties.high ?? 5)
            : severity === "medium"
              ? (penalties.medium ?? 2)
              : severity === "low"
                ? (penalties.low ?? 1)
                : 0;

      if (penaltyValue > 0) {
        totalPenalty += penaltyValue;
      }
    }
  }

  const adjustedScore = Math.min(100, baseRiskScore + totalPenalty);
  return { adjustedScore, appliedPenalties: totalPenalty };
}

export { shouldBlockMerge, resolveCheckName, checkConclusionForEvaluation };

// ---------------------------------------------------------------------------
// PR risk labels
// ---------------------------------------------------------------------------

const RISK_LABELS: Record<string, { color: string; description: string }> = {
  "trailhead:low-risk": {
    color: "0e8a16",
    description: "Trailhead: low risk score",
  },
  "trailhead:medium-risk": {
    color: "fbca04",
    description: "Trailhead: medium risk score",
  },
  "trailhead:high-risk": {
    color: "d93f0b",
    description: "Trailhead: high risk score",
  },
};

function riskLabelForDecision(decision: GateDecision): string {
  switch (decision) {
    case "allow":
      return "trailhead:low-risk";
    case "warn":
      return "trailhead:medium-risk";
    case "block":
      return "trailhead:high-risk";
    default: {
      const _exhaustive: never = decision;
      throw new Error(`Unknown decision: ${_exhaustive}`);
    }
  }
}

export async function managePrLabels(
  prNumber: number,
  decision: GateDecision,
  token: string,
): Promise<void> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const targetLabel = riskLabelForDecision(decision);

    for (const labelName of Object.keys(RISK_LABELS)) {
      const meta = RISK_LABELS[labelName];
      try {
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: labelName,
          color: meta.color,
          description: meta.description,
        });
      } catch {
        // 422 = already exists — expected
      }
    }

    const { data: currentLabels } = await octokit.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number: prNumber,
    });

    for (const label of currentLabels) {
      const isRiskLabel =
        (label.name.startsWith("trailhead:") || label.name.startsWith("deployguard:")) &&
        label.name.endsWith("-risk");
      if (isRiskLabel && label.name !== targetLabel) {
        await octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: prNumber,
          name: label.name,
        });
      }
    }

    const alreadyApplied = currentLabels.some((l) => l.name === targetLabel);
    if (!alreadyApplied) {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels: [targetLabel],
      });
    }
  } catch (error) {
    core.debug(`Failed to manage PR labels: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Auto-request reviewers on high risk
// ---------------------------------------------------------------------------

export async function requestHighRiskReviewers(
  prNumber: number,
  reviewers: string[],
  token: string,
): Promise<void> {
  if (reviewers.length === 0) return;

  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    const author = pr.user?.login;

    const filtered = reviewers.filter((r) => r !== author);
    if (filtered.length === 0) return;

    await octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: prNumber,
      reviewers: filtered,
    });
  } catch (error) {
    core.debug(`Failed to request reviewers: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function buildScoreBar(score: number, threshold: number): string {
  const width = 20;
  const filled = Math.round((score / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `\`${bar}\` ${score}/100 (threshold: ${threshold})`;
}

export function suggestSplitBoundaries(files: string[]): string[] {
  if (files.length < 5) return [];

  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const parts = f.replace(/\\/g, "/").split("/");
    let bucket: string;

    if (parts[0] === ".github") {
      bucket = "CI/workflow";
    } else if (/^(migrations?|supabase)/i.test(parts[0])) {
      bucket = "database/migrations";
    } else if (parts.length >= 2) {
      bucket = parts.slice(0, 2).join("/");
    } else {
      bucket = parts[0];
    }

    (groups[bucket] ??= []).push(f);
  }

  const sorted = Object.entries(groups)
    .filter(([, v]) => v.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  if (sorted.length < 2) return [];

  const suggestions: string[] = [];
  const [first, second] = sorted;

  suggestions.push(
    `- **Suggested split:** \`${first[0]}/\` changes (${first[1].length} files) ` +
      `could be a separate PR from \`${second[0]}/\` changes (${second[1].length} files).`,
  );

  if (sorted.length > 2) {
    const rest = sorted.slice(2);
    const restTotal = rest.reduce((sum, [, v]) => sum + v.length, 0);
    suggestions.push(
      `- ${rest.length} other group${rest.length > 1 ? "s" : ""} (${restTotal} files) ` +
        `may also be separable: ${rest.map(([k, v]) => `\`${k}/\` (${v.length})`).join(", ")}.`,
    );
  }

  return suggestions;
}

function buildGuidance(evaluation: GateEvaluation): string[] {
  if (evaluation.gateDecision === "allow") return [];

  const lines: string[] = [`### Guidance`, ``];
  const factorTypes = new Set(evaluation.riskFactors.map((f) => f.type));

  if (factorTypes.has("sensitive_files")) {
    lines.push(
      `- This PR modifies **high-risk files** (auth, migrations, payments, CI). ` +
        `Consider splitting into smaller PRs or adding targeted reviewers.`,
    );
  }

  const churnFactor = evaluation.riskFactors.find((f) => f.type === "code_churn");
  if (churnFactor && churnFactor.score >= 70) {
    lines.push(
      `- **Large changeset** detected (churn score ${churnFactor.score}/100). ` +
        `Consider breaking this into smaller, reviewable increments.`,
    );
  }

  const testFactor = evaluation.riskFactors.find((f) => f.type === "test_coverage");
  if (testFactor && testFactor.score >= 80) {
    const detail = testFactor.detail as Record<string, unknown> | undefined;
    const testFiles = (detail?.["testFiles"] as number | undefined) ?? 0;
    if (testFiles === 0) {
      lines.push(
        `- **No test files** included in this PR. Adding test coverage reduces deployment risk.`,
      );
    } else {
      lines.push(
        `- **Low test-to-source ratio**. Consider adding more tests for the changed source files.`,
      );
    }
  }

  if (factorTypes.has("security_alerts")) {
    const secFactor = evaluation.riskFactors.find((f) => f.type === "security_alerts");
    const secDetail = secFactor?.detail as { total?: number } | undefined;
    lines.push(
      `- **${secDetail?.total ?? "Open"} security alert(s)** found by code scanning. ` +
        `Address critical and high severity findings before deploying.`,
    );
  }

  if (factorTypes.has("deployment_history")) {
    lines.push(
      `- **Recent deployment failures** detected. ` +
        `Proceed with caution — the target environment has instability.`,
    );
  }

  const fileCountFactor = evaluation.riskFactors.find((f) => f.type === "file_count");
  const shouldSuggestSplit =
    (fileCountFactor && fileCountFactor.score >= 70) ||
    (churnFactor && churnFactor.score >= 70);

  if (fileCountFactor && fileCountFactor.score >= 80) {
    lines.push(
      `- **Many files changed**. Large PRs are harder to review thoroughly — consider splitting.`,
    );
  }

  if (shouldSuggestSplit && evaluation.files && evaluation.files.length >= 5) {
    const splits = suggestSplitBoundaries(evaluation.files);
    if (splits.length > 0) {
      lines.push(...splits);
    }
  }

  if (factorTypes.has("dependency_changes")) {
    const depFactor = evaluation.riskFactors.find((f) => f.type === "dependency_changes");
    const depDetail = depFactor?.detail as { files?: string[] } | undefined;
    lines.push(
      `- **Dependency changes** detected in ${depDetail?.files?.length ?? "some"} file(s). ` +
        `Review added/changed dependencies for security and compatibility.`,
    );
  }

  const prAgeFactor = evaluation.riskFactors.find((f) => f.type === "pr_age");
  if (prAgeFactor && prAgeFactor.score >= 30) {
    const ageDetail = prAgeFactor.detail as { ageDays?: number } | undefined;
    lines.push(
      `- **Stale PR** — open for ${ageDetail?.ageDays ?? "many"} days. ` +
        `Long-lived PRs accumulate risk from merge conflicts and context loss.`,
    );
  }

  if (lines.length === 2) {
    if (evaluation.gateDecision === "warn") {
      lines.push(
        `- Advisory warning only: review the risk factors above and proceed with normal caution.`,
      );
    } else {
      lines.push(
        `- Risk score exceeds threshold. Review the risk factors above before merging.`,
      );
    }
  }

  lines.push(``);
  return lines;
}

function decisionIcon(decision: GateDecision): string {
  switch (decision) {
    case "allow":
      return "✅";
    case "warn":
      return "⚠️";
    case "block":
      return "🚫";
    default:
      return "❓";
  }
}

function riskBadge(score: number, threshold: number): string {
  const color =
    score > threshold ? "red" : score > threshold - 15 ? "yellow" : "brightgreen";
  return `![Risk Score](https://img.shields.io/badge/risk-${score}%2F100-${color})`;
}

function healthBadge(score: number): string {
  const color = score >= 80 ? "brightgreen" : score >= 50 ? "yellow" : "red";
  return `![Health](https://img.shields.io/badge/health-${score}%2F100-${color})`;
}

function buildFactorChart(factors: GateEvaluation["riskFactors"]): string[] {
  if (factors.length === 0) return [];
  const sorted = [...factors].sort((a, b) => b.score - a.score);
  const lines: string[] = [];
  for (const f of sorted) {
    const barLen = Math.round(f.score / 5);
    const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
    const label = f.type.replace(/_/g, " ");
    lines.push(`\`${bar}\` ${f.score}/100 — ${label}`);
  }
  return lines;
}

export function wrapCollapsibleSection(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `<details><summary><strong>${title}</strong></summary>\n\n${trimmed}\n\n</details>`;
}

function formatCiCheckCell(check: CiCheck): string {
  const req = check.required ? " *(required)*" : "";
  if (
    check.detailsUrl &&
    (check.status === "fail" ||
      check.status === "missing" ||
      check.status === "stale" ||
      check.status === "pending")
  ) {
    return `[${check.name} ↗](${check.detailsUrl})${req}`;
  }
  return `${check.name}${req}`;
}

export function formatGateReport(
  evaluation: GateEvaluation,
  riskThreshold?: number,
): string {
  const mode = evaluation.gateMode ?? "risk-only";
  const icon =
    mode === "release-ready"
      ? evaluation.releaseReady
        ? "✅"
        : "🚫"
      : decisionIcon(evaluation.gateDecision);
  const threshold = riskThreshold ?? 70;
  const healthDisplay =
    evaluation.healthChecks.length > 0
      ? `${evaluation.healthScore}/100`
      : "n/a (not configured)";

  const envLabel = evaluation.environment ? ` (${evaluation.environment})` : "";
  const contextLabel = evaluation.context?.name
    ? ` · context: **${evaluation.context.name}**`
    : "";

  const headline =
    mode === "release-ready"
      ? evaluation.releaseReady
        ? "RELEASE READY"
        : "NOT RELEASE READY"
      : evaluation.gateDecision.toUpperCase();

  const lines: string[] = [];

  // ADR-011 §1 — the brief leads; the pre-existing report stays below it so the
  // same `<!-- trailhead-gate-report -->` comment upgrades in place.
  if (evaluation.releaseBrief) {
    lines.push(
      renderReleaseBrief(evaluation.releaseBrief, {
        // The same markdown becomes a check run's output.summary, which GitHub
        // caps at 65535 characters; leave room for the report below.
        maxChars: BRIEF_MAX_CHARS,
        ...(evaluation.reportUrl ? { storedEvaluationUrl: evaluation.reportUrl } : {}),
      }),
      ``,
      `---`,
      ``,
    );
  }

  lines.push(`## ${icon} Trailhead — ${headline}${envLabel}${contextLabel}`, ``);

  if (mode === "release-ready" || mode === "advisory") {
    lines.push(
      `| Dimension | Status |`,
      `|-----------|--------|`,
      `| **Release Ready** | **${evaluation.releaseReady ? "YES" : "NO"}** |`,
      `| Risk | ${evaluation.riskScore}/100 (threshold ${threshold}) |`,
      ...(evaluation.sizeScore !== undefined
        ? [`| Size / blast radius | ${evaluation.sizeScore}/100 (reported separately) |`]
        : []),
      `| Health | ${healthDisplay} |`,
      `| Gate | ${evaluation.gateDecision.toUpperCase()} |`,
      ``,
    );

    if (evaluation.ci && evaluation.ci.checks.length > 0) {
      lines.push(`### CI Checks`, ``, `| Check | Status |`, `|-------|--------|`);
      for (const check of evaluation.ci.checks) {
        lines.push(
          `| ${formatCiCheckCell(check)} | ${formatCiStatusIcon(check.status)} ${check.status} |`,
        );
      }
      lines.push(``);
    }

    if (evaluation.releaseReadyReasons && evaluation.releaseReadyReasons.length > 0) {
      lines.push(`### Release Readiness Issues`, ``);
      for (const reason of evaluation.releaseReadyReasons) {
        lines.push(`- ${reason}`);
      }
      lines.push(``);
    }

    if (evaluation.cross_repo_impact) {
      lines.push(
        ...formatCrossRepoImpactSection({
          factor: null,
          findings: [],
          affectedConsumers: [],
          services: evaluation.cross_repo_impact.services.map((service) => ({
            serviceName: service.serviceName,
            touchedFiles: service.touchedFiles,
            notify_webhook: service.notify_webhook,
            consumers: service.consumers.map((consumer) => ({
              id: consumer.id,
              repo: consumer.repo,
              branch: consumer.branch,
            })),
          })),
        }),
      );
    }
  } else {
    lines.push(
      riskBadge(evaluation.riskScore, threshold) +
        " " +
        (evaluation.healthChecks.length > 0 ? healthBadge(evaluation.healthScore) : ""),
      ``,
      `| Metric | Score |`,
      `|--------|-------|`,
      `| Health | ${healthDisplay} |`,
      `| Risk   | ${evaluation.riskScore}/100 |`,
      ...(evaluation.sizeScore !== undefined
        ? [`| Size / blast radius | ${evaluation.sizeScore}/100 |`]
        : []),
      `| **Decision** | **${evaluation.gateDecision.toUpperCase()}** |`,
      ``,
    );

    if (riskThreshold !== undefined) {
      lines.push(`**Risk:** ${buildScoreBar(evaluation.riskScore, riskThreshold)}`, ``);
    }
  }

  if (evaluation.remediation && evaluation.agentBriefMode !== "off") {
    const brief = formatAgentBrief(
      evaluation.remediation,
      evaluation.agentBriefMode ?? "collapsed",
    );
    if (brief) {
      lines.push(brief, ``);
    }
  }

  if (evaluation.pr?.provenance) {
    lines.push(
      `### PR Provenance`,
      ``,
      `- Type: \`${evaluation.pr.provenance.type}\``,
      `- Confidence: \`${evaluation.pr.provenance.confidence}\``,
      ...(evaluation.pr.provenance.source
        ? [`- Source: ${evaluation.pr.provenance.source}`]
        : []),
      ``,
    );
  }

  if (evaluation.session_correlation) {
    lines.push(
      `### Session Correlation`,
      ``,
      `- Burst count: \`${evaluation.session_correlation.burst_count}\``,
      `- Window: \`${evaluation.session_correlation.window}\``,
      ``,
    );
  }

  if (evaluation.trust_profile) {
    lines.push(
      `### Trust Profile`,
      ``,
      `- Strictness: \`${evaluation.trust_profile.strictness}\``,
      `- Reason: ${evaluation.trust_profile.reason}`,
      ``,
    );
  }

  if (evaluation.escalation_status) {
    lines.push(
      `### Escalation`,
      ``,
      `- Enabled: \`${evaluation.escalation_status.enabled}\``,
      `- Targets: \`${evaluation.escalation_status.target_count}\``,
      ...(evaluation.escalation_status.acknowledge_sla_minutes
        ? [
            `- Acknowledge SLA: \`${evaluation.escalation_status.acknowledge_sla_minutes}m\``,
          ]
        : []),
      ...(evaluation.escalation_status.resolve_sla_minutes
        ? [`- Resolve SLA: \`${evaluation.escalation_status.resolve_sla_minutes}m\``]
        : []),
      ``,
    );
  }

  if (evaluation.policyFindings && evaluation.policyFindings.length > 0) {
    const findingsBody = evaluation.policyFindings
      .map((finding) => `- ${finding}`)
      .join("\n");
    lines.push(
      wrapCollapsibleSection(
        `Policy Findings (${evaluation.policyFindings.length})`,
        findingsBody,
      ),
      ``,
    );
  }

  if (evaluation.policyOverride) {
    const override = evaluation.policyOverride;
    if (override.source === "label") {
      lines.push(
        `### Release Override (\`trailhead-override\`)`,
        ``,
        `- Author: \`${override.owner}\``,
        `- Reason: ${override.reason}`,
        `- Applied: \`${override.appliedAt}\``,
        `- Expires: \`${override.expiresAt}\``,
        `- Pre-override decision: \`${override.preOverrideDecision ?? evaluation.gateDecision}\``,
        `- Pre-override release ready: \`${override.preOverrideReleaseReady ?? false}\``,
        ...(override.preOverrideReasons && override.preOverrideReasons.length > 0
          ? [
              `- Pre-override blockers:`,
              ...override.preOverrideReasons.map((reason) => `  - ${reason}`),
            ]
          : []),
        ``,
      );
    } else {
      const changes: string[] = [];
      if (override.changes.failMode)
        changes.push(`fail-mode=${override.changes.failMode}`);
      if (override.changes.riskThreshold !== undefined) {
        changes.push(`risk-threshold=${override.changes.riskThreshold}`);
      }
      if (override.changes.warnThreshold !== undefined) {
        changes.push(`warn-threshold=${override.changes.warnThreshold}`);
      }
      lines.push(
        `### Policy Override`,
        ``,
        `- Owner: \`${override.owner}\``,
        `- Ticket: \`${override.linkedTicket}\``,
        `- Reason: ${override.reason}`,
        `- Expires: \`${override.expiresAt}\``,
        `- Changes: ${changes.length > 0 ? changes.join(", ") : "none"}`,
        ``,
      );
    }
  }

  if (evaluation.riskFactors.length > 0) {
    lines.push(
      `<details><summary><strong>Risk Factor Breakdown</strong> (${evaluation.riskFactors.length} factors)</summary>`,
      ``,
    );
    const chart = buildFactorChart(evaluation.riskFactors);
    lines.push(...chart);
    lines.push(``);

    for (const factor of evaluation.riskFactors) {
      const detail = factor.detail as Record<string, unknown> | undefined;
      const desc = (detail?.["description"] as string | undefined) ?? factor.type;
      lines.push(`- **${factor.type}** — ${desc}: score ${factor.score}/100`);
    }
    lines.push(``, `</details>`, ``);
  }

  const guidance = buildGuidance(evaluation);
  if (guidance.length > 0) {
    lines.push(...guidance);
  }

  if (evaluation.healthChecks.length > 0) {
    lines.push(
      `<details><summary><strong>Health Checks</strong> (${evaluation.healthChecks.length})</summary>`,
      ``,
    );
    for (const check of evaluation.healthChecks) {
      const icon =
        check.status === "allow" ? "🟢" : check.status === "warn" ? "🟡" : "🔴";
      lines.push(
        `${icon} \`${check.target}\` — ${check.status.toUpperCase()} (${check.latencyMs}ms)`,
      );
    }
    lines.push(``, `</details>`, ``);
  }

  if (evaluation.files && evaluation.files.length > 0) {
    const sensitiveSet = new Set(evaluation.files.filter((f) => isSensitiveFile(f)));
    lines.push(
      `<details><summary>Files changed (${evaluation.files.length})</summary>`,
      ``,
    );
    for (const file of evaluation.files) {
      const marker = sensitiveSet.has(file) ? " **⚠ sensitive**" : "";
      lines.push(`- \`${file}\`${marker}`);
    }
    lines.push(``, `</details>`, ``);
  }

  if (evaluation.reportUrl) {
    lines.push(`[View full report](${evaluation.reportUrl})`);
  }

  return lines.join("\n");
}
