// Pure risk scoring engine — no framework dependencies.
// Shared across the GitHub Action, MCP server, and GitHub App.

// ---------------------------------------------------------------------------
// Interfaces (framework-agnostic mirrors of the Zod schemas in types.ts)
// ---------------------------------------------------------------------------

export interface FileInfo {
  filename: string;
  additions?: number;
  deletions?: number;
  changes: number;
  patch?: string;
}

export interface RiskFactorResult {
  type: string;
  score: number;
  detail?: Record<string, unknown>;
}

export interface SensitivityConfig {
  high: string[];
  medium: string[];
  low: string[];
}

export interface RiskProfileMatchDef {
  files_include: string[];
  files_exclude: string[];
  min_files?: number;
  max_files?: number;
}

export interface RiskProfileDef {
  name?: string;
  match: RiskProfileMatchDef;
  weights: Record<string, number>;
}

export interface RiskConfig {
  sensitivity?: SensitivityConfig;
  weights?: Record<string, number>;
  ignore?: string[];
  profiles?: RiskProfileDef[];
  /** Extra globs treated as non-source for sensitive_files + test_coverage (not file_count). */
  non_source_globs?: string[];
}

export interface SecurityAlertCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
  topRules?: string[];
}

export interface DeploymentOutcomeSummary {
  recentFailures: number;
  recentTotal: number;
  lastDeployFailed: boolean;
  lastRollback: boolean;
}

// ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

// Recognizes test files across language conventions, not just JS `.test.`/`.spec.`.
// The `_test.<ext>` arm covers the Deno convention (`foo_test.ts`) — komatik's
// entire Edge-Function suite uses it, so without this every EF PR scored as
// zero-coverage and got over-penalized at the agent risk threshold (#307). Also
// covers Go (`_test.go`), Python (`test_*.py` / `*_test.py` / `conftest.py`),
// Ruby (`*_spec.rb` / `spec/`), and Java (`*Test.java`/`*Tests.java`).
export const TEST_FILE_PATTERN =
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|_test\.(ts|tsx|js|jsx|mjs|cjs|go)$|(^|\/)test_[^/]+\.py$|_test\.py$|(^|\/)conftest\.py$|_spec\.rb$|(^|\/)spec\/|(Test|Tests)\.java$|__tests__\/|\.cy\.(ts|js)$/;

export const NON_SOURCE_PATTERN =
  /\.(sql|ya?ml|json|md|css|svg|lock|txt|env|png|jpg|gif)$/i;

export const SENSITIVE_PATTERNS = [
  /(?:^|\/)migrations\//i,
  /(?:^|\/)auth/i,
  /(?:^|\/)security/i,
  /(?:^|\/)payment/i,
  /(?:^|\/)billing/i,
  /(?:^|\/)webhook/i,
  /(?:^|\/)infrastructure\//i,
  /(?:^|\/)\.github\/workflows\//i,
  /(?:^|\/)secrets/i,
  /(?:^|\/)\.env/i,
];

const HIGH_SENSITIVITY_PATTERN = /(?:^|\/)(?:auth|security|payment|billing|webhook)/i;

const INFRA_SENSITIVITY_PATTERN =
  /(?:^|\/)(?:migrations|infrastructure|\.github\/workflows|secrets|\.env)/i;

export const DEPENDENCY_FILES = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^requirements\.txt$/,
  /^Pipfile\.lock$/,
  /^poetry\.lock$/,
  /^go\.mod$/,
  /^go\.sum$/,
  /^Gemfile\.lock$/,
  /^Cargo\.lock$/,
  /^composer\.lock$/,
];

const PACKAGE_JSON_DEPENDENCY_FIELDS = new Set([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
]);

// ---------------------------------------------------------------------------
// Factor weights (v3: includes security_alerts, deployment_history, canary_status)
// ---------------------------------------------------------------------------

export const FACTOR_WEIGHTS: Record<string, number> = {
  code_churn: 3,
  test_coverage: 2,
  file_count: 2,
  sensitive_files: 3,
  author_history: 1,
  dependency_changes: 2,
  pr_age: 1,
  security_alerts: 4,
  deployment_history: 2,
  canary_status: 2,
  ci_integrity: 3,
  workflow_security: 4,
  prompt_injection_risk: 4,
  supply_chain: 3,
  pr_scope: 2,
  duplicate_logic: 1,
  cross_repo_impact: 2,
};

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchesGlobs(filename: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(filename));
}

// ---------------------------------------------------------------------------
// Risk profile matching
// ---------------------------------------------------------------------------

export function matchRiskProfile(
  filenames: string[],
  profiles: RiskProfileDef[],
): RiskProfileDef | null {
  if (profiles.length === 0) return null;

  for (const profile of profiles) {
    const m = profile.match;

    if (m.min_files !== undefined && filenames.length < m.min_files) continue;
    if (m.max_files !== undefined && filenames.length > m.max_files) continue;

    if (
      m.files_include.length > 0 &&
      !m.files_include.every((pattern) =>
        filenames.some((f) => matchesGlobs(f, [pattern])),
      )
    ) {
      continue;
    }

    if (
      m.files_exclude.length > 0 &&
      m.files_exclude.some((pattern) => filenames.some((f) => matchesGlobs(f, [pattern])))
    ) {
      continue;
    }

    return profile;
  }

  return null;
}

// ---------------------------------------------------------------------------
// File classification helpers
// ---------------------------------------------------------------------------

export function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERN.test(filename);
}

export function isNonSourceFile(filename: string): boolean {
  return NON_SOURCE_PATTERN.test(filename);
}

export function isWorkflowFile(filename: string): boolean {
  return /(?:^|\/)\.github\/workflows\//i.test(filename);
}

/** Non-source for risk-factor purposes (markdown, config, consumer-declared globs). */
export function isContentNonSource(
  filename: string,
  config?: RiskConfig | null,
): boolean {
  if (/(?:^|\/)migrations\//i.test(filename)) return false;
  if (isNonSourceFile(filename) && !isWorkflowFile(filename)) return true;
  const extra = config?.non_source_globs ?? [];
  return extra.length > 0 && matchesGlobs(filename, extra);
}

export function isTestableSourceFile(
  filename: string,
  config?: RiskConfig | null,
): boolean {
  if (isTestFile(filename)) return false;
  if (/(?:^|\/)migrations\//i.test(filename)) return false;
  return !isContentNonSource(filename, config);
}

export function isSensitiveFile(filename: string, config?: RiskConfig | null): boolean {
  if (isContentNonSource(filename, config) && !isWorkflowFile(filename)) return false;
  return SENSITIVE_PATTERNS.some((p) => p.test(filename));
}

export function riskConfigFromRepo(
  repo?: {
    sensitivity?: SensitivityConfig;
    weights?: Record<string, number>;
    ignore?: string[];
    profiles?: RiskProfileDef[];
    risk?: { non_source_globs?: string[] };
  } | null,
): RiskConfig | null {
  if (!repo) return null;
  return {
    sensitivity: repo.sensitivity,
    weights: repo.weights,
    ignore: repo.ignore,
    profiles: repo.profiles,
    non_source_globs: repo.risk?.non_source_globs,
  };
}

export function sensitivityWeight(filename: string, config?: RiskConfig | null): number {
  if (config) {
    if (config.ignore?.length && matchesGlobs(filename, config.ignore)) return 0;
    if (
      config.sensitivity?.high.length &&
      matchesGlobs(filename, config.sensitivity.high)
    )
      return 3;
    if (
      config.sensitivity?.medium.length &&
      matchesGlobs(filename, config.sensitivity.medium)
    )
      return 2;
    if (config.sensitivity?.low.length && matchesGlobs(filename, config.sensitivity.low))
      return 0.5;
  }

  if (isTestFile(filename)) return 0.3;
  if (HIGH_SENSITIVITY_PATTERN.test(filename)) return 3;
  if (INFRA_SENSITIVITY_PATTERN.test(filename)) return 2;
  if (isNonSourceFile(filename)) return 0.5;
  return 1;
}

// ---------------------------------------------------------------------------
// Weighted average
// ---------------------------------------------------------------------------

export function weightedAverageScores(
  factors: RiskFactorResult[],
  overrides?: Record<string, number>,
): number {
  if (factors.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const f of factors) {
    const w = overrides?.[f.type] ?? FACTOR_WEIGHTS[f.type] ?? 1;
    weightedSum += f.score * w;
    totalWeight += w;
  }
  const avg = Math.round(weightedSum / totalWeight);
  return Math.min(100, Math.max(0, avg));
}

// ---------------------------------------------------------------------------
// Risk scoring (pure — no API calls)
// ---------------------------------------------------------------------------

export function computeRiskScore(
  files: FileInfo[],
  config?: RiskConfig | null,
): {
  score: number;
  factors: RiskFactorResult[];
} {
  if (files.length === 0) {
    return { score: 0, factors: [] };
  }

  const ignorePatterns = config?.ignore ?? [];
  const effectiveFiles =
    ignorePatterns.length > 0
      ? files.filter((f) => !matchesGlobs(f.filename, ignorePatterns))
      : files;

  if (effectiveFiles.length === 0) {
    return { score: 0, factors: [] };
  }

  const factors: RiskFactorResult[] = [];
  const customWeights = config?.weights ?? {};

  const fileCount = effectiveFiles.length;
  const fileCountScore = Math.min(100, Math.round(30 * Math.log2(1 + fileCount)));
  factors.push({
    type: "file_count",
    score: fileCountScore,
    detail: { fileCount, description: "Number of files changed" },
  });

  const totalChanges = effectiveFiles.reduce((sum, f) => sum + f.changes, 0);
  const weightedChanges = effectiveFiles.reduce(
    (sum, f) => sum + f.changes * sensitivityWeight(f.filename, config),
    0,
  );
  const churnScore = Math.min(100, Math.round(25 * Math.log2(1 + weightedChanges / 50)));
  factors.push({
    type: "code_churn",
    score: churnScore,
    detail: {
      totalChanges,
      weightedChanges: Math.round(weightedChanges),
      description: "Sensitivity-weighted lines changed",
    },
  });

  const testFileCount = effectiveFiles.filter((f) => isTestFile(f.filename)).length;
  const testableSourceFiles = effectiveFiles.filter((f) =>
    isTestableSourceFile(f.filename, config),
  );
  const nonSourceCount = effectiveFiles.filter(
    (f) => !isTestFile(f.filename) && isContentNonSource(f.filename, config),
  ).length;
  if (testableSourceFiles.length > 0) {
    const testRatio = testFileCount / testableSourceFiles.length;
    const testCoverageScore =
      testFileCount === 0
        ? 100
        : Math.round(
            Math.max(0, 100 - testRatio * 100 - Math.min(testFileCount, 5) * 10),
          );
    factors.push({
      type: "test_coverage",
      score: testCoverageScore,
      detail: {
        testFiles: testFileCount,
        sourceFiles: testableSourceFiles.length,
        nonSourceFiles: nonSourceCount,
        testRatio: Math.round(testRatio * 100) / 100,
        skipped: false,
      },
    });
  }

  const highSensPatterns = config?.sensitivity?.high ?? [];
  const sensitiveByConfig =
    highSensPatterns.length > 0
      ? effectiveFiles.filter((f) => matchesGlobs(f.filename, highSensPatterns))
      : [];
  const sensitiveByDefault = effectiveFiles.filter((f) =>
    isSensitiveFile(f.filename, config),
  );
  const sensitiveFilenames = new Set([
    ...sensitiveByConfig.map((f) => f.filename),
    ...sensitiveByDefault.map((f) => f.filename),
  ]);
  const sensitiveFiles = effectiveFiles.filter((f) => sensitiveFilenames.has(f.filename));

  if (sensitiveFiles.length > 0) {
    const sensitiveScore = Math.min(100, sensitiveFiles.length * 25);
    factors.push({
      type: "sensitive_files",
      score: sensitiveScore,
      detail: {
        count: sensitiveFiles.length,
        files: sensitiveFiles.map((f) => f.filename),
        description: "High-risk files (migrations, auth, payments, CI)",
      },
    });
  }

  return { score: weightedAverageScores(factors, customWeights), factors };
}

// ---------------------------------------------------------------------------
// Dependency change detection
// ---------------------------------------------------------------------------

export function detectDependencyChanges(files: FileInfo[]): RiskFactorResult | null {
  const depFiles = files.filter((f) =>
    DEPENDENCY_FILES.some((p) => p.test(f.filename.replace(/.*\//, ""))),
  );
  if (depFiles.length === 0) return null;

  const isLockfile = (filename: string): boolean =>
    /\.(lock|sum)$|lock\.(json|yaml)$/.test(filename);

  const packageJsonTouchesDependencies = (patch?: string): boolean => {
    if (!patch) return true;
    let activeSection: string | null = null;
    let sectionDepth = 0;

    for (const rawLine of patch.split("\n")) {
      if (rawLine.startsWith("@@")) continue;
      const prefix = rawLine[0];
      if (prefix !== " " && prefix !== "+" && prefix !== "-") continue;

      const line = rawLine.slice(1);
      const sectionMatch = line.match(/^\s*"([^"]+)"\s*:\s*\{\s*$/);
      if (sectionMatch) {
        const key = sectionMatch[1];
        if (PACKAGE_JSON_DEPENDENCY_FIELDS.has(key)) {
          activeSection = key;
          sectionDepth = 1;
          if (prefix !== " ") return true;
          continue;
        }
      }

      if (!activeSection) continue;

      const openCount = (line.match(/\{/g) ?? []).length;
      const closeCount = (line.match(/\}/g) ?? []).length;
      sectionDepth += openCount - closeCount;

      if (prefix !== " " && /^\s*"[^"]+"\s*:\s*".*"\s*,?\s*$/.test(line)) {
        return true;
      }

      if (sectionDepth <= 0) {
        activeSection = null;
        sectionDepth = 0;
      }
    }

    return false;
  };

  const relevantDepFiles = depFiles.filter((f) => {
    const base = f.filename.replace(/.*\//, "");
    if (base === "package.json") {
      return packageJsonTouchesDependencies(f.patch);
    }
    return true;
  });

  if (relevantDepFiles.length === 0) return null;

  const hasLockfile = relevantDepFiles.some((f) => isLockfile(f.filename));
  const hasManifest = relevantDepFiles.some((f) => !isLockfile(f.filename));
  const totalChanges = relevantDepFiles.reduce((s, f) => s + f.changes, 0);

  const score = Math.min(
    100,
    (hasManifest && hasLockfile ? 40 : hasManifest ? 60 : 20) +
      Math.min(30, Math.round(totalChanges / 100)),
  );

  return {
    type: "dependency_changes",
    score,
    detail: {
      files: relevantDepFiles.map((f) => f.filename),
      hasManifest,
      hasLockfile,
      totalChanges,
      description: "Dependency manifests/lockfiles changed",
    },
  };
}

// ---------------------------------------------------------------------------
// Security alerts risk factor (computed from pre-fetched alert counts)
// ---------------------------------------------------------------------------

export function computeSecurityFactor(
  alerts: SecurityAlertCounts,
): RiskFactorResult | null {
  if (alerts.total === 0) return null;

  const score = Math.min(
    100,
    alerts.critical * 30 + alerts.high * 15 + alerts.medium * 5 + alerts.low * 1,
  );

  return {
    type: "security_alerts",
    score,
    detail: {
      critical: alerts.critical,
      high: alerts.high,
      medium: alerts.medium,
      low: alerts.low,
      total: alerts.total,
      topRules: alerts.topRules,
      description: `${alerts.total} open security alert(s)`,
    },
  };
}

// ---------------------------------------------------------------------------
// Deployment history risk factor
// ---------------------------------------------------------------------------

export function computeDeploymentHistoryFactor(
  outcomes: DeploymentOutcomeSummary,
): RiskFactorResult | null {
  if (outcomes.recentTotal === 0) return null;

  let score = 0;
  const reasons: string[] = [];

  if (outcomes.recentFailures > 0) {
    score += Math.min(40, outcomes.recentFailures * 20);
    reasons.push(`${outcomes.recentFailures} recent failure(s)`);
  }
  if (outcomes.lastRollback) {
    score += 30;
    reasons.push("last deploy was rolled back");
  }
  if (outcomes.lastDeployFailed) {
    score += 20;
    reasons.push("last deploy failed");
  }

  score = Math.min(100, score);
  if (score === 0) return null;

  return {
    type: "deployment_history",
    score,
    detail: {
      recentFailures: outcomes.recentFailures,
      recentTotal: outcomes.recentTotal,
      lastDeployFailed: outcomes.lastDeployFailed,
      lastRollback: outcomes.lastRollback,
      description: reasons.join("; "),
    },
  };
}

// ---------------------------------------------------------------------------
// Release freeze window check
// ---------------------------------------------------------------------------

export interface FreezeWindowDef {
  days: string[];
  afterHour?: number;
  beforeHour?: number;
  timezone?: string;
  message?: string;
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function isInFreezeWindow(
  freezes: FreezeWindowDef[],
  now?: Date,
): { frozen: boolean; message?: string } {
  if (freezes.length === 0) return { frozen: false };

  const d = now ?? new Date();

  for (const freeze of freezes) {
    const dayName = DAY_NAMES[d.getUTCDay()];
    const matchesDay =
      freeze.days.length === 0 || freeze.days.some((fd) => fd.toLowerCase() === dayName);

    if (!matchesDay) continue;

    const hour = d.getUTCHours();
    const afterOk = freeze.afterHour === undefined || hour >= freeze.afterHour;
    const beforeOk = freeze.beforeHour === undefined || hour < freeze.beforeHour;

    if (afterOk && beforeOk) {
      return {
        frozen: true,
        message: freeze.message ?? `Deployment frozen (${dayName} ${hour}:00 UTC)`,
      };
    }
  }

  return { frozen: false };
}

// ---------------------------------------------------------------------------
// Gate decision
// ---------------------------------------------------------------------------

export type GateDecisionValue = "allow" | "warn" | "block";

export function decideGate(
  riskScore: number,
  healthScore: number,
  blockThreshold: number,
  warnThreshold?: number,
): GateDecisionValue {
  const effectiveWarn = warnThreshold ?? blockThreshold - 15;
  if (riskScore > blockThreshold) return "block";
  if (riskScore > effectiveWarn || healthScore < 50) return "warn";
  return "allow";
}

/**
 * GATE-3 (2b): critical-factor hard-escalation for sensitive_files.
 *
 * The final risk score is a weighted AVERAGE, so a single critical factor can be
 * diluted by clean ones. Most genuinely-critical conditions (destructive SQL,
 * supply-chain critical vulns, prompt injection, CI/workflow integrity) already
 * bypass the average via forceBlock. `sensitive_files` did NOT — a change touching
 * auth/payment/infra-critical files (score up to 100) only fed the average.
 *
 * This escalates it OUT of the average: at/above the threshold it forces at least
 * a warn (mode: "warn", the soak default) or a block (mode: "block"). Scoped to
 * the sensitive_files factor by design — the noisy factors (file_count, code_churn,
 * test_coverage, external deps, mock/placeholder) must never escalate.
 */
export function decideSensitiveFilesEscalation(
  factors: Pick<RiskFactorResult, "type" | "score">[],
  cfg?: { enabled?: boolean; mode?: "warn" | "block"; threshold?: number } | null,
): { block: boolean; warn: boolean; reason: string | null } {
  const none = { block: false, warn: false, reason: null };
  if (cfg?.enabled === false) return none;
  const factor = factors.find((f) => f.type === "sensitive_files");
  const threshold = cfg?.threshold ?? 100;
  if (!factor || factor.score < threshold) return none;
  const mode = cfg?.mode ?? "warn";
  const reason = `Sensitive-file change at critical level (sensitive_files score ${factor.score} ≥ ${threshold}) — escalated out of the risk average (${mode}).`;
  return { block: mode === "block", warn: mode === "warn", reason };
}

// ---------------------------------------------------------------------------
// Rollback detection
// ---------------------------------------------------------------------------

export function isRollback(prTitle: string): boolean {
  return /\brevert\b/i.test(prTitle) || /\brollback\b/i.test(prTitle);
}
