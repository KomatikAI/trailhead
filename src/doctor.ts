import fs from "node:fs";
import path from "node:path";
import { checkNameMatches } from "./ci-core.js";
import { collectConfigWarnings, parseRepoConfigContent } from "./config-core.js";
import { resolveCheckName } from "./release-ready.js";
import type { GateMode, RepoConfig } from "./types.js";

export type DoctorSeverity = "error" | "warn" | "info";

export interface DoctorFinding {
  severity: DoctorSeverity;
  code: string;
  message: string;
}

export interface DoctorReport {
  configPath: string | null;
  configValid: boolean;
  gateMode: GateMode;
  expectedCheckName: string;
  configuredChecks: string[];
  observedChecks: string[];
  findings: DoctorFinding[];
  ok: boolean;
}

export interface RunDoctorOptions {
  cwd?: string;
  offline?: boolean;
  githubToken?: string;
  repo?: string;
  ref?: string;
}

const CONFIG_CANDIDATES = [".trailhead.yml", ".deployguard.yml"];

export function findConfigPath(cwd: string): string | null {
  for (const name of CONFIG_CANDIDATES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadRepoConfig(cwd: string): {
  configPath: string | null;
  config: RepoConfig | null;
  error?: string;
} {
  const configPath = findConfigPath(cwd);
  if (!configPath) {
    return {
      configPath: null,
      config: null,
      error: "No .trailhead.yml or .deployguard.yml found",
    };
  }

  const content = fs.readFileSync(configPath, "utf8");
  const config = parseRepoConfigContent(content);
  if (!config) {
    return {
      configPath,
      config: null,
      error: `Failed to parse ${path.basename(configPath)} — check YAML structure and schema fields`,
    };
  }

  return { configPath, config };
}

export function collectConfiguredChecks(config: RepoConfig): string[] {
  const names = new Set<string>();
  for (const context of config.contexts) {
    for (const name of context.ci?.required_checks ?? []) {
      names.add(name);
    }
    for (const name of context.ci?.optional_checks ?? []) {
      names.add(name);
    }
  }
  return [...names];
}

export function validateConfigStructure(
  config: RepoConfig,
  configPath: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = collectConfigWarnings(config).map((message) => ({
    severity: "warn",
    code: "config_warning",
    message,
  }));
  const fileName = path.basename(configPath);
  const gateMode = config.gate.mode;

  if (gateMode !== "risk-only" && config.schema_version < 2) {
    findings.push({
      severity: "warn",
      code: "schema_version",
      message: `${fileName} uses schema_version ${config.schema_version} with gate.mode=${gateMode} — consider schema_version: 2 and contexts[]`,
    });
  }

  const risk = config.thresholds.risk;
  const warn = config.thresholds.warn;
  if (risk !== undefined && warn !== undefined && warn >= risk) {
    findings.push({
      severity: "warn",
      code: "threshold_order",
      message: `warn threshold (${warn}) should be lower than risk threshold (${risk})`,
    });
  }

  if (gateMode !== "risk-only") {
    if (config.contexts.length === 0) {
      findings.push({
        severity: "error",
        code: "missing_contexts",
        message:
          "release-ready/advisory mode requires at least one contexts[] entry with ci.required_checks",
      });
    }

    for (const context of config.contexts) {
      const required = context.ci?.required_checks ?? [];
      if (required.length === 0) {
        findings.push({
          severity: "warn",
          code: "empty_required_checks",
          message: `Context "${context.name}" has no ci.required_checks — release-ready may not wait for CI`,
        });
      }
    }
  }

  const gateCheck = resolveCheckName(gateMode, config.gate.check_name);
  if (gateMode !== "risk-only" && !gateCheck.includes("Release Ready")) {
    findings.push({
      severity: "info",
      code: "custom_check_name",
      message: `Branch protection should require check name "${gateCheck}"`,
    });
  }

  return findings;
}

export function compareConfiguredChecks(
  configuredChecks: string[],
  observedChecks: string[],
): DoctorFinding[] {
  if (observedChecks.length === 0) {
    return [];
  }

  const findings: DoctorFinding[] = [];
  const observed = [...new Set(observedChecks)];

  for (const configured of configuredChecks) {
    const matched = observed.some((actual) => checkNameMatches(configured, actual));
    if (!matched) {
      findings.push({
        severity: "warn",
        code: "unknown_check_name",
        message: `Configured check "${configured}" did not match any recent GitHub check run`,
      });
    }
  }

  const selfChecks = new Set([
    "Trailhead",
    "Trailhead — Release Ready",
    resolveCheckName("release-ready"),
    resolveCheckName("risk-only"),
  ]);

  for (const actual of observed) {
    if (selfChecks.has(actual)) continue;
    const referenced = configuredChecks.some((configured) =>
      checkNameMatches(configured, actual),
    );
    if (!referenced) {
      findings.push({
        severity: "info",
        code: "unconfigured_check",
        message: `GitHub check "${actual}" is not referenced in contexts[].ci (optional unless required)`,
      });
    }
  }

  return findings;
}

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export function parseRepoRef(input: string): GitHubRepoRef | null {
  const match = input.match(/^([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function githubRequest<T>(
  token: string,
  url: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      message: body || response.statusText,
    };
  }

  return { ok: true, data: (await response.json()) as T };
}

async function resolveCommitSha(
  token: string,
  repoRef: GitHubRepoRef,
  ref?: string,
): Promise<string | null> {
  if (ref) return ref;

  const pulls = await githubRequest<Array<{ head: { sha: string } }>>(
    token,
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/pulls?state=open&per_page=1`,
  );
  if (pulls.ok && pulls.data[0]?.head.sha) {
    return pulls.data[0].head.sha;
  }

  const repo = await githubRequest<{ default_branch: string }>(
    token,
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}`,
  );
  if (!repo.ok) return null;

  const branch = await githubRequest<{ commit: { sha: string } }>(
    token,
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/branches/${encodeURIComponent(repo.data.default_branch)}`,
  );
  return branch.ok ? branch.data.commit.sha : null;
}

export async function fetchObservedCheckNames(options: {
  token: string;
  repo: GitHubRepoRef;
  ref?: string;
}): Promise<{ checks: string[]; error?: string }> {
  const sha = await resolveCommitSha(options.token, options.repo, options.ref);
  if (!sha) {
    return { checks: [], error: "Could not resolve a commit SHA for check lookup" };
  }

  const names = new Set<string>();
  let page = 1;

  while (true) {
    const result = await githubRequest<{
      check_runs: Array<{ name: string }>;
    }>(
      options.token,
      `https://api.github.com/repos/${options.repo.owner}/${options.repo.repo}/commits/${sha}/check-runs?per_page=100&page=${page}`,
    );

    if (!result.ok) {
      return {
        checks: [],
        error: `GitHub Checks API failed (HTTP ${result.status})`,
      };
    }

    for (const run of result.data.check_runs) {
      names.add(run.name);
    }

    if (result.data.check_runs.length < 100) break;
    page += 1;
  }

  return { checks: [...names].sort() };
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const loaded = loadRepoConfig(cwd);
  const findings: DoctorFinding[] = [];

  if (!loaded.configPath || !loaded.config) {
    findings.push({
      severity: "error",
      code: "config_missing",
      message: loaded.error ?? "Configuration file not found",
    });
    return {
      configPath: loaded.configPath,
      configValid: false,
      gateMode: "risk-only",
      expectedCheckName: "Trailhead",
      configuredChecks: [],
      observedChecks: [],
      findings,
      ok: false,
    };
  }

  const config = loaded.config;
  const gateMode = config.gate.mode;
  const expectedCheckName = resolveCheckName(gateMode, config.gate.check_name);
  const configuredChecks = collectConfiguredChecks(config);

  findings.push(...validateConfigStructure(config, loaded.configPath));

  let observedChecks: string[] = [];
  if (!options.offline) {
    const token = options.githubToken ?? process.env.GITHUB_TOKEN ?? "";
    const repoInput = options.repo ?? process.env.GITHUB_REPOSITORY ?? "";
    const repoRef = parseRepoRef(repoInput);

    if (!token) {
      findings.push({
        severity: "info",
        code: "offline_checks",
        message:
          "Set GITHUB_TOKEN (or pass --token) to compare configured checks against GitHub",
      });
    } else if (!repoRef) {
      findings.push({
        severity: "info",
        code: "offline_checks",
        message:
          "Set GITHUB_REPOSITORY (or pass --repo owner/name) to compare checks against GitHub",
      });
    } else {
      const observed = await fetchObservedCheckNames({
        token,
        repo: repoRef,
        ref: options.ref,
      });
      observedChecks = observed.checks;
      if (observed.error) {
        findings.push({
          severity: "warn",
          code: "github_checks",
          message: observed.error,
        });
      } else if (configuredChecks.length > 0) {
        findings.push(...compareConfiguredChecks(configuredChecks, observedChecks));
      }
    }
  }

  const ok = !findings.some((finding) => finding.severity === "error");
  return {
    configPath: loaded.configPath,
    configValid: true,
    gateMode,
    expectedCheckName,
    configuredChecks,
    observedChecks,
    findings,
    ok,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("Trailhead Doctor");
  lines.push("================");
  lines.push("");

  if (report.configPath) {
    lines.push(`Config: ${report.configPath}`);
  } else {
    lines.push("Config: (not found)");
  }

  lines.push(`Gate mode: ${report.gateMode}`);
  lines.push(`Expected branch protection check: ${report.expectedCheckName}`);

  if (report.configuredChecks.length > 0) {
    lines.push(`Configured CI checks: ${report.configuredChecks.join(", ")}`);
  }

  if (report.observedChecks.length > 0) {
    lines.push(`Observed GitHub checks: ${report.observedChecks.join(", ")}`);
  }

  if (report.findings.length === 0) {
    lines.push("");
    lines.push("No issues found.");
    return lines.join("\n");
  }

  lines.push("");
  for (const finding of report.findings) {
    const label =
      finding.severity === "error"
        ? "ERROR"
        : finding.severity === "warn"
          ? "WARN"
          : "INFO";
    lines.push(`${label} [${finding.code}] ${finding.message}`);
  }

  lines.push("");
  lines.push(
    report.ok
      ? "Result: OK (review warnings before release-ready rollout)"
      : "Result: FAILED",
  );
  return lines.join("\n");
}
