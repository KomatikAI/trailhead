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
}
