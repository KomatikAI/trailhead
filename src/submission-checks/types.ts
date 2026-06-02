export interface SubmissionFileInfo {
  filename: string;
  patch?: string;
  status?: string;
  /** Full file content when fetched by the gate (optional). */
  content?: string;
  additions?: number;
}

import type { DetectorPolicyMap } from "./detector-policy.js";
import type { RenamePatternEntry } from "./policy-defaults.js";

export interface NamingAllowlistConfig {
  skip_extensions?: string[];
  skip_path_patterns?: string[];
  skip_comment_markers?: string[];
  skip_in_imports?: boolean;
}

export interface SubmissionCheckContext {
  files: SubmissionFileInfo[];
  prPaths: Set<string>;
  komatikInstance: boolean;
  staleTerms: string[];
  namingAllowlist: NamingAllowlistConfig;
  authRouteAllowlist: string[];
  maxFileLines: number;
  declaredPackages: Set<string>;
  /** Extra path segments to skip for context_freshness (merged with defaults). */
  pathIgnorePatterns: string[];
  renamePatterns: RenamePatternEntry[];
  slugOnlyPatterns: RegExp[];
  detectorPolicy: DetectorPolicyMap;
  /**
   * Full set of paths that exist in the target repo (e.g. `git ls-files`),
   * used to tell a fabricated reference from a reference to an existing,
   * unchanged file. When absent, existence-dependent checks stay dormant
   * rather than flag every path that simply isn't part of this PR.
   */
  repoPaths?: Set<string>;
  /**
   * Org catalog index — every Backstage entity `metadata.name` published across
   * the org's `catalog-info.yaml` files. Lets `contract_integrity` (ADR-010)
   * resolve CROSS-REPO contract references (e.g. a satellite `consumesApis: [x]`
   * where `x` is published by another repo). When absent, cross-repo contract
   * refs are reported as advisory ("unverified") rather than flagged, so a
   * single-repo PR doesn't false-positive on a legitimately external contract.
   */
  catalogKnownEntities?: Set<string>;
}
