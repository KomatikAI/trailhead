// Resolve submission detector policy from `.trailhead.yml` (issue #256).
import { SubmissionCheckCode as SubmissionCheckCodeEnum } from "../types.js";
import { compileRenamePattern, compileSlugOnlyPatterns, DEFAULT_ARTIFACT_FILE_GLOBS, DEFAULT_RENAME_PATTERNS, DEFAULT_SLUG_ONLY_PATTERN_SOURCES, } from "./policy-defaults.js";
function normalizeSeverity(severity) {
    if (severity === "block")
        return "blocking";
    return severity;
}
export function resolveDetectorPolicy(submission) {
    const raw = submission?.detectors ?? {};
    const warnings = [];
    const policy = {};
    for (const [key, value] of Object.entries(raw)) {
        const parsed = SubmissionCheckCodeEnum.safeParse(key);
        if (!parsed.success) {
            warnings.push(`Unknown submission.detectors key "${key}" will be ignored.`);
            continue;
        }
        if (!value || typeof value !== "object")
            continue;
        policy[parsed.data] = {
            enabled: value.enabled,
            severity: value.severity ? normalizeSeverity(value.severity) : undefined,
            fileGlobs: value.file_globs,
            pathIgnore: value.path_ignore,
        };
    }
    return { policy, warnings };
}
export function buildRenamePatterns(submission, options) {
    const custom = (submission?.rename_patterns ?? []).map(({ old, new: newName }) => compileRenamePattern(old, newName));
    const defaults = options?.includeKomatikDefaults ? DEFAULT_RENAME_PATTERNS : [];
    return [...defaults, ...custom];
}
export function buildSlugOnlyPatterns(submission) {
    const sources = [
        ...DEFAULT_SLUG_ONLY_PATTERN_SOURCES,
        ...(submission?.slug_only_patterns ?? []),
    ];
    return compileSlugOnlyPatterns(sources);
}
export function artifactFileGlobs(policy) {
    return policy.artifact_integrity?.fileGlobs ?? DEFAULT_ARTIFACT_FILE_GLOBS;
}
export function applyDetectorPolicy(code, check, policy) {
    const entry = policy[code];
    if (entry?.enabled === false)
        return null;
    if (!check)
        return null;
    if (entry?.severity) {
        return { ...check, severity: entry.severity };
    }
    return check;
}
export function getSubmissionConfigWarnings(submission) {
    return resolveDetectorPolicy(submission).warnings;
}
