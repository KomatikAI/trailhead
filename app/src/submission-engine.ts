// Gate 1 — agent submission quality (Phase B1).
// Pure module: no @actions/*, octokit, or Node I/O.

import { runAllDetectors } from "./submission-checks/detectors.js";
import type { SubmissionCheckContext } from "./submission-checks/types.js";
import { prPathSet } from "./submission-checks/helpers.js";
import { SubmissionCheckCode } from "./types.js";
import type { RepoConfig, SubmissionCheckResult } from "./types.js";

export type { SubmissionFileInfo } from "./submission-checks/types.js";
export type { SubmissionCheckCode, SubmissionCheckResult } from "./types.js";

/** Gate 1 + Phase 0 submission check codes — keep in sync with A8 fixture manifest. */
export const SUBMISSION_CHECK_CODES = SubmissionCheckCode.options;

const DEFAULT_STALE_TERMS = ["deployguard", "DeployGuard"];

const DEFAULT_AUTH_ROUTE_ALLOWLIST = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/health/",
  "/api/metrics/",
];

export interface SubmissionEngineOptions {
  files: import("./submission-checks/types.js").SubmissionFileInfo[];
  repoConfig?: RepoConfig | null;
  komatikInstance?: boolean;
  mode?: "warn" | "block";
  /** Declared npm package names from root package.json (optional). */
  declaredPackages?: string[];
}

function buildContext(options: SubmissionEngineOptions): SubmissionCheckContext {
  const { files, repoConfig, komatikInstance = false } = options;
  const staleTerms =
    repoConfig?.submission?.stale_terms ?? (komatikInstance ? DEFAULT_STALE_TERMS : []);

  const declared = new Set(options.declaredPackages ?? []);

  return {
    files,
    prPaths: prPathSet(files),
    komatikInstance,
    staleTerms,
    authRouteAllowlist:
      repoConfig?.submission?.auth_route_allowlist ?? DEFAULT_AUTH_ROUTE_ALLOWLIST,
    maxFileLines: repoConfig?.submission?.max_file_lines ?? 1000,
    declaredPackages: declared,
  };
}

export function runSubmissionGate(
  options: SubmissionEngineOptions,
): SubmissionCheckResult[] {
  if (options.files.length === 0) return [];
  return runAllDetectors(buildContext(options));
}

export function submissionGateShouldBlock(
  checks: SubmissionCheckResult[],
  mode: "warn" | "block" = "block",
): boolean {
  if (mode !== "block") return false;
  return checks.some((check) => check.severity === "blocking");
}
