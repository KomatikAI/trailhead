// Gate 1 — agent submission quality (Phase B1).
// Pure module: no @actions/*, octokit, or Node I/O.

import { runAllDetectors } from "./submission-checks/detectors.js";
import type { SubmissionCheckContext } from "./submission-checks/types.js";
import { prPathSet } from "./submission-checks/helpers.js";
import {
  buildRenamePatterns,
  buildSlugOnlyPatterns,
  getSubmissionConfigWarnings,
  resolveDetectorPolicy,
} from "./submission-checks/detector-policy.js";
import { SubmissionCheckCode } from "./types.js";
import type { RepoConfig, SubmissionCheckResult } from "./types.js";

export type { SubmissionFileInfo } from "./submission-checks/types.js";
export type { SubmissionCheckCode, SubmissionCheckResult } from "./types.js";
export { getSubmissionConfigWarnings };

/** Gate 1 + Phase 0 submission check codes — keep in sync with A8 fixture manifest. */
export const SUBMISSION_CHECK_CODES = SubmissionCheckCode.options;

const DEFAULT_AUTH_ROUTE_ALLOWLIST = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/health/",
  "/api/metrics/",
];

const DEFAULT_AUTH_ROUTE_HELPERS = [
  "getUser",
  "getSession",
  "getServerSession",
  "auth",
  "requireAuth",
  "withAuth",
];

/** Package names declared in a package.json (legacy gate parity). */
export function declaredPackageNamesFromPackageJson(
  pkg: Record<string, unknown>,
): string[] {
  const sections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const;
  return sections.flatMap((key) =>
    Object.keys((pkg[key] as Record<string, string> | undefined) ?? {}),
  );
}

export interface SubmissionEngineOptions {
  files: import("./submission-checks/types.js").SubmissionFileInfo[];
  repoConfig?: RepoConfig | null;
  komatikInstance?: boolean;
  /** Home repo slug for the agent-suggestions convention (cross-repo detection). */
  agentRepo?: string;
  mode?: "warn" | "block";
  /** Declared npm package names from root package.json (optional). */
  declaredPackages?: string[];
  /** Paths that exist in the target repo (e.g. `git ls-files`), optional. */
  repoPaths?: string[];
  /**
   * Org catalog entity names resolved by the caller (I/O layer) — e.g. loaded
   * from `submission.contract_integrity.catalog_index_path`. Merged with the
   * inline `known_entities` config for the `contract_integrity` detector.
   */
  catalogKnownEntities?: string[];
  /** Promotion branch topology (GITHUB_BASE_REF / GITHUB_HEAD_REF), set by the gate. */
  promotion?: { baseBranch?: string; headBranch?: string };
  /** PR description body (pull_request.body), set by the gate — for close_on_ship_link. */
  prBody?: string;
}

function buildContext(options: SubmissionEngineOptions): SubmissionCheckContext {
  const { files, repoConfig, komatikInstance = false, agentRepo } = options;
  const staleTerms = repoConfig?.submission?.stale_terms ?? [];

  const declared = new Set(options.declaredPackages ?? []);
  const { policy } = resolveDetectorPolicy(repoConfig?.submission);

  // contract_integrity (ADR-010): org catalog index = inline config ∪ caller-loaded.
  const inlineKnown = repoConfig?.submission?.contract_integrity?.known_entities ?? [];
  const catalogKnownEntities = new Set<string>([
    ...inlineKnown,
    ...(options.catalogKnownEntities ?? []),
  ]);

  return {
    files,
    prPaths: prPathSet(files),
    komatikInstance,
    agentRepo,
    staleTerms,
    namingAllowlist: repoConfig?.submission?.naming_allowlist ?? {},
    authRouteAllowlist:
      repoConfig?.submission?.auth_route_allowlist ?? DEFAULT_AUTH_ROUTE_ALLOWLIST,
    authRouteHelpers: [
      ...DEFAULT_AUTH_ROUTE_HELPERS,
      ...(repoConfig?.submission?.auth_route_helpers ?? []),
    ],
    retiredRouteAllowlist: repoConfig?.submission?.retired_route_allowlist ?? [],
    maxFileLines: repoConfig?.submission?.max_file_lines ?? 1000,
    declaredPackages: declared,
    pathIgnorePatterns: repoConfig?.submission?.path_ignore ?? [],
    renamePatterns: buildRenamePatterns(repoConfig?.submission, {
      includeKomatikDefaults: komatikInstance,
    }),
    slugOnlyPatterns: buildSlugOnlyPatterns(repoConfig?.submission),
    detectorPolicy: policy,
    repoPaths: options.repoPaths ? new Set(options.repoPaths) : undefined,
    catalogKnownEntities:
      catalogKnownEntities.size > 0 ? catalogKnownEntities : undefined,
    promotion: options.promotion,
    prBody: options.prBody,
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
