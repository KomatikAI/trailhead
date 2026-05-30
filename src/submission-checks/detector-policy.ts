// Resolve submission detector policy from `.trailhead.yml` (issue #256).

import type {
  RemediationSeverity,
  SubmissionCheckCode,
  SubmissionConfig,
  SubmissionDetectorPolicyEntry,
} from "../types.js";
import { SubmissionCheckCode as SubmissionCheckCodeEnum } from "../types.js";
import {
  compileRenamePattern,
  compileSlugOnlyPatterns,
  DEFAULT_ARTIFACT_FILE_GLOBS,
  DEFAULT_RENAME_PATTERNS,
  DEFAULT_SLUG_ONLY_PATTERN_SOURCES,
  type RenamePatternEntry,
} from "./policy-defaults.js";

export type DetectorPolicyEntry = {
  enabled?: boolean;
  severity?: RemediationSeverity;
  fileGlobs?: string[];
  pathIgnore?: string[];
};

export type DetectorPolicyMap = Partial<Record<SubmissionCheckCode, DetectorPolicyEntry>>;

function normalizeSeverity(
  severity: NonNullable<SubmissionDetectorPolicyEntry["severity"]>,
): RemediationSeverity {
  if (severity === "block") return "blocking";
  return severity as RemediationSeverity;
}

export function resolveDetectorPolicy(submission?: Partial<SubmissionConfig>): {
  policy: DetectorPolicyMap;
  warnings: string[];
} {
  const raw = submission?.detectors ?? {};
  const warnings: string[] = [];
  const policy: DetectorPolicyMap = {};

  for (const [key, value] of Object.entries(raw)) {
    const parsed = SubmissionCheckCodeEnum.safeParse(key);
    if (!parsed.success) {
      warnings.push(`Unknown submission.detectors key "${key}" will be ignored.`);
      continue;
    }
    if (!value || typeof value !== "object") continue;

    policy[parsed.data] = {
      enabled: value.enabled,
      severity: value.severity ? normalizeSeverity(value.severity) : undefined,
      fileGlobs: value.file_globs,
      pathIgnore: value.path_ignore,
    };
  }

  return { policy, warnings };
}

export function buildRenamePatterns(
  submission?: Partial<SubmissionConfig>,
  options?: { includeKomatikDefaults?: boolean },
): RenamePatternEntry[] {
  const custom = (submission?.rename_patterns ?? []).map(({ old, new: newName }) =>
    compileRenamePattern(old, newName),
  );
  const defaults = options?.includeKomatikDefaults ? DEFAULT_RENAME_PATTERNS : [];
  return [...defaults, ...custom];
}

export function buildSlugOnlyPatterns(submission?: Partial<SubmissionConfig>): RegExp[] {
  const sources = [
    ...DEFAULT_SLUG_ONLY_PATTERN_SOURCES,
    ...(submission?.slug_only_patterns ?? []),
  ];
  return compileSlugOnlyPatterns(sources);
}

export function artifactFileGlobs(policy: DetectorPolicyMap): string[] {
  return policy.artifact_integrity?.fileGlobs ?? DEFAULT_ARTIFACT_FILE_GLOBS;
}

export function applyDetectorPolicy(
  code: SubmissionCheckCode,
  check: import("../types.js").SubmissionCheckResult | null,
  policy: DetectorPolicyMap,
): import("../types.js").SubmissionCheckResult | null {
  const entry = policy[code];
  if (entry?.enabled === false) return null;
  if (!check) return null;
  if (entry?.severity) {
    return { ...check, severity: entry.severity };
  }
  return check;
}

export function getSubmissionConfigWarnings(
  submission?: Partial<SubmissionConfig>,
): string[] {
  return resolveDetectorPolicy(submission).warnings;
}
