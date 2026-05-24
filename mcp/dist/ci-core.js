export const DEFAULT_SELF_CHECK_NAMES = ["Trailhead", "Trailhead — Release Ready"];
/**
 * Map GitHub check conclusion/status to Trailhead CI status (ADR-009).
 */
export function classifyCheck(status, conclusion) {
    if (status === "completed") {
        switch (conclusion) {
            case "success":
                return "pass";
            case "skipped":
            case "neutral":
                return "skip";
            case "failure":
            case "timed_out":
            case "action_required":
            case "cancelled":
                return "fail";
            default:
                return "pending";
        }
    }
    if (status === "in_progress" || status === "queued" || status === "pending") {
        return "pending";
    }
    return "pending";
}
function isSelfCheck(name, excludeNames) {
    const lower = name.toLowerCase();
    return excludeNames.some((n) => n.toLowerCase() === lower);
}
export function checkNameMatches(configured, actual) {
    if (configured === actual)
        return true;
    if (configured.toLowerCase() === actual.toLowerCase())
        return true;
    return actual.toLowerCase().startsWith(configured.toLowerCase());
}
export function normalizeCheckRuns(runs, excludeCheckNames = DEFAULT_SELF_CHECK_NAMES) {
    return runs
        .filter((r) => !isSelfCheck(r.name, excludeCheckNames))
        .map((r) => ({
        name: r.name,
        status: classifyCheck(r.status, r.conclusion),
        conclusion: r.conclusion ?? undefined,
        detailsUrl: r.details_url ?? r.html_url ?? undefined,
        required: false,
    }));
}
export function evaluateRequiredChecks(allChecks, ciConfig) {
    const requiredNames = ciConfig.required_checks;
    const optionalNames = ciConfig.optional_checks;
    const missingPolicy = ciConfig.missing_required;
    const evaluated = [];
    const seen = new Set();
    for (const reqName of requiredNames) {
        const match = allChecks.find((c) => checkNameMatches(reqName, c.name));
        if (match) {
            evaluated.push({ ...match, name: reqName, required: true });
            seen.add(match.name);
        }
        else {
            evaluated.push({
                name: reqName,
                status: missingPolicy === "skip" ? "skip" : "missing",
                required: true,
            });
        }
    }
    for (const optName of optionalNames) {
        const match = allChecks.find((c) => checkNameMatches(optName, c.name));
        if (match) {
            evaluated.push({ ...match, name: optName, required: false });
            seen.add(match.name);
        }
        else {
            evaluated.push({
                name: optName,
                status: "missing",
                required: false,
            });
        }
    }
    for (const check of allChecks) {
        if (!seen.has(check.name)) {
            evaluated.push({ ...check, required: false });
        }
    }
    const requiredChecks = evaluated.filter((c) => c.required);
    const pendingCount = requiredChecks.filter((c) => c.status === "pending").length;
    const failedCount = requiredChecks.filter((c) => c.status === "fail" || c.status === "missing" || c.status === "stale").length;
    const missingCount = requiredChecks.filter((c) => c.status === "missing").length;
    const allRequiredPassed = requiredNames.length === 0 ||
        requiredChecks.every((c) => c.status === "pass" || c.status === "skip");
    return {
        checks: evaluated,
        allRequiredPassed,
        pendingCount,
        failedCount,
        missingCount,
    };
}
export function formatCiStatusIcon(status) {
    switch (status) {
        case "pass":
            return "✅";
        case "fail":
            return "❌";
        case "skip":
            return "⏭️";
        case "pending":
            return "⏳";
        case "stale":
            return "⚠️";
        case "missing":
            return "❓";
        default: {
            const _exhaustive = status;
            return "•";
        }
    }
}
