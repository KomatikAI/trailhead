// Gate 1 — agent submission quality (Phase B1).
// Pure module: no @actions/*, octokit, or Node I/O.

import type { RepoConfig, SubmissionCheckResult } from "./types.js";
import { SubmissionCheckCode } from "./types.js";

export type { SubmissionCheckCode, SubmissionCheckResult } from "./types.js";

/** All Gate 1 check codes — keep in sync with A8 fixture manifest. */
export const SUBMISSION_CHECK_CODES = SubmissionCheckCode.options;

export interface SubmissionFileInfo {
  filename: string;
  patch?: string;
  status?: string;
}

export interface SubmissionEngineOptions {
  files: SubmissionFileInfo[];
  repoConfig?: RepoConfig | null;
  /** When true, enable Komatik-specific checks (SOUL paths, etc.). */
  komatikInstance?: boolean;
  mode?: "warn" | "block";
}

const MOCK_PLACEHOLDER_PATTERNS = [
  /\bTODO\s*\(\s*mock\s*\)/i,
  /\bFIXME\s*\(\s*mock\s*\)/i,
  /\bMOCK_[A-Z0-9_]+\b/,
  /\bfakeImplementation\b/,
  /\bstubResponse\s*\(/i,
];

const SECRET_PATTERNS = [
  /\bsk_live_[A-Za-z0-9]{10,}\b/,
  /\bsk_test_[A-Za-z0-9]{10,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

const DESTRUCTIVE_SQL_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
];

const DEFAULT_STALE_TERMS = ["deployguard", "DeployGuard"];

function addedLines(patch: string | undefined): string[] {
  if (!patch) return [];
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function scanAddedContent(
  files: SubmissionFileInfo[],
  predicate: (line: string, filename: string) => boolean,
): string[] {
  const hits: string[] = [];
  for (const file of files) {
    for (const line of addedLines(file.patch)) {
      if (predicate(line, file.filename)) hits.push(file.filename);
    }
  }
  return [...new Set(hits)];
}

function detectMockPlaceholder(
  files: SubmissionFileInfo[],
): SubmissionCheckResult | null {
  const hits = scanAddedContent(files, (line) =>
    MOCK_PLACEHOLDER_PATTERNS.some((re) => re.test(line)),
  );
  if (hits.length === 0) return null;
  return {
    code: "mock_placeholder",
    severity: "blocking",
    title: "Mock placeholder in production path",
    detail: `Found mock/TODO placeholder patterns in ${hits.join(", ")}. Replace stubs before review.`,
    files: hits,
    suggested_action: "Remove mock placeholders and implement real behavior.",
    autofix_eligible: false,
  };
}

function detectSecrets(files: SubmissionFileInfo[]): SubmissionCheckResult | null {
  const hits = scanAddedContent(files, (line) =>
    SECRET_PATTERNS.some((re) => re.test(line)),
  );
  if (hits.length === 0) return null;
  return {
    code: "secrets",
    severity: "blocking",
    title: "Potential secret in diff",
    detail: `Added lines match secret patterns in ${hits.join(", ")}. Rotate any exposed credential.`,
    files: hits,
    suggested_action:
      "Remove secrets from source; use environment variables or a secret manager.",
    autofix_eligible: false,
  };
}

function detectDestructiveSql(files: SubmissionFileInfo[]): SubmissionCheckResult | null {
  const sqlFiles = files.filter((f) => /\.sql$/i.test(f.filename));
  const hits = scanAddedContent(sqlFiles, (line) =>
    DESTRUCTIVE_SQL_PATTERNS.some((re) => re.test(line)),
  );
  if (hits.length === 0) return null;
  return {
    code: "destructive_sql",
    severity: "blocking",
    title: "Destructive SQL in migration",
    detail: `Added SQL contains destructive statements in ${hits.join(", ")}.`,
    files: hits,
    suggested_action:
      "Use additive migrations; avoid DROP/TRUNCATE without explicit human approval.",
    autofix_eligible: false,
  };
}

function detectContextFreshness(
  files: SubmissionFileInfo[],
  staleTerms: string[],
): SubmissionCheckResult | null {
  if (staleTerms.length === 0) return null;
  const hits = scanAddedContent(files, (line) =>
    staleTerms.some((term) => line.toLowerCase().includes(term.toLowerCase())),
  );
  if (hits.length === 0) return null;
  return {
    code: "context_freshness",
    severity: "warn",
    title: "Stale naming or deprecated terms",
    detail: `Added lines reference deprecated terms (${staleTerms.join(", ")}) in ${hits.join(", ")}.`,
    files: hits,
    suggested_action:
      "Update naming to match current product vocabulary (see BRAND.md / repo docs).",
    autofix_eligible: true,
  };
}

function detectPathFormat(files: SubmissionFileInfo[]): SubmissionCheckResult | null {
  const hits = files
    .map((f) => f.filename)
    .filter(
      (name) => /^komatik-agents\/agents\//.test(name) || /\/agents\/agents\//.test(name),
    );
  if (hits.length === 0) return null;
  return {
    code: "path_format",
    severity: "warn",
    title: "Suspicious agent path prefix",
    detail: `Files use repo-name prefix in internal paths: ${hits.join(", ")}.`,
    files: hits,
    suggested_action:
      "Use agents/<agent-id>/... not <repo>/agents/... for agent workspace paths.",
    autofix_eligible: false,
  };
}

function detectArtifactIntegrity(
  files: SubmissionFileInfo[],
): SubmissionCheckResult | null {
  const prPaths = new Set(files.map((f) => f.filename.replace(/\\/g, "/")));
  const referenced = new Set<string>();

  const pathRefPattern =
    /(?:^|\s|['"`])([\w@./-]+\.(?:ts|tsx|js|jsx|md|sql|yml|yaml|json))(?:['"`]|\s|:)/g;

  for (const file of files) {
    for (const line of addedLines(file.patch)) {
      if (!/(?:import|from|require|see|fix|update)\s/i.test(line)) continue;
      for (const match of line.matchAll(pathRefPattern)) {
        const candidate = match[1]?.replace(/^\.\//, "");
        if (!candidate || candidate.includes("*")) continue;
        if (!prPaths.has(candidate) && !candidate.startsWith("node:")) {
          referenced.add(candidate);
        }
      }
    }
  }

  if (referenced.size === 0) return null;
  const missing = [...referenced].slice(0, 8);
  return {
    code: "artifact_integrity",
    severity: "blocking",
    title: "Referenced files missing from PR",
    detail: `Added lines reference paths not in this PR: ${missing.join(", ")}${referenced.size > 8 ? "…" : ""}.`,
    files: missing,
    suggested_action:
      "Include the referenced files in this PR or fix hallucinated paths.",
    autofix_eligible: false,
  };
}

export function runSubmissionGate(
  options: SubmissionEngineOptions,
): SubmissionCheckResult[] {
  const { files, repoConfig, komatikInstance = false } = options;
  if (files.length === 0) return [];

  const staleTerms =
    repoConfig?.submission?.stale_terms ?? (komatikInstance ? DEFAULT_STALE_TERMS : []);

  const checks: Array<SubmissionCheckResult | null> = [
    detectMockPlaceholder(files),
    detectSecrets(files),
    detectDestructiveSql(files),
    detectArtifactIntegrity(files),
    detectContextFreshness(files, staleTerms),
    komatikInstance ? detectPathFormat(files) : null,
  ];

  return checks.filter((check): check is SubmissionCheckResult => check !== null);
}

export function submissionGateShouldBlock(
  checks: SubmissionCheckResult[],
  mode: "warn" | "block" = "block",
): boolean {
  if (mode !== "block") return false;
  return checks.some((check) => check.severity === "blocking");
}
