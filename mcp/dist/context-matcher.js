import { matchesGlobs } from "./risk-engine.js";
function branchMatches(patterns, branch) {
    if (patterns.length === 0)
        return true;
    return matchesGlobs(branch, patterns);
}
function labelsMatch(required, prLabels) {
    if (required.length === 0)
        return true;
    const normalized = new Set(prLabels.map((l) => l.toLowerCase()));
    return required.every((label) => normalized.has(label.toLowerCase()));
}
function contextMatches(ctx, pr) {
    const { match } = ctx;
    if (!branchMatches(match.base_branch, pr.baseRef))
        return false;
    if (!branchMatches(match.head_branch, pr.headRef))
        return false;
    if (!labelsMatch(match.labels, pr.labels))
        return false;
    return true;
}
/**
 * Returns the first matching context (declaration order wins).
 */
export function matchContext(contexts, pr) {
    for (const ctx of contexts) {
        if (!contextMatches(ctx, pr))
            continue;
        return {
            context: ctx,
            matched: {
                name: ctx.name,
                environment: ctx.environment,
            },
        };
    }
    return null;
}
export function resolveGateMode(repoGateMode, schemaVersion, inputGateMode) {
    if (inputGateMode === "release-ready" ||
        inputGateMode === "advisory" ||
        inputGateMode === "risk-only") {
        return inputGateMode;
    }
    if (repoGateMode === "release-ready" ||
        repoGateMode === "advisory" ||
        repoGateMode === "risk-only") {
        return repoGateMode;
    }
    return schemaVersion >= 2 ? "release-ready" : "risk-only";
}
