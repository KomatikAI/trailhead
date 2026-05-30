export interface SubmissionFileInfo {
  filename: string;
  patch?: string;
  status?: string;
  /** Full file content when fetched by the gate (optional). */
  content?: string;
  additions?: number;
}

export interface SubmissionCheckContext {
  files: SubmissionFileInfo[];
  prPaths: Set<string>;
  komatikInstance: boolean;
  staleTerms: string[];
  authRouteAllowlist: string[];
  maxFileLines: number;
  declaredPackages: Set<string>;
  /** Extra path segments to skip for context_freshness (merged with defaults). */
  pathIgnorePatterns: string[];
  /**
   * Full set of paths that exist in the target repo (e.g. `git ls-files`),
   * used to tell a fabricated reference from a reference to an existing,
   * unchanged file. When absent, existence-dependent checks stay dormant
   * rather than flag every path that simply isn't part of this PR.
   */
  repoPaths?: Set<string>;
}
