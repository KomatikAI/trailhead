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
function findManifestJob(manifest, configuredName) {
    return manifest.jobs.find((job) => checkNameMatches(configuredName, job.name));
}
function statusFromManifestJob(job) {
    switch (job.outcome) {
        case "passed":
            return "pass";
        case "skipped":
            return "skip";
        case "failed":
        case "cancelled":
            return "fail";
        case "pending":
            return "pending";
        case "ran":
            return undefined;
        default: {
            const _exhaustive = job.outcome;
            return undefined;
        }
    }
}
function applyManifestToCheck(check, manifest, configuredName) {
    if (!manifest)
        return check;
    const manifestJob = findManifestJob(manifest, configuredName);
    if (!manifestJob)
        return check;
    const manifestStatus = statusFromManifestJob(manifestJob);
    if (manifestStatus === "skip") {
        return {
            ...check,
            status: "skip",
            conclusion: manifestJob.reason ?? check.conclusion,
        };
    }
    if (manifestStatus && (check.status === "missing" || check.status === "pending")) {
        return {
            ...check,
            status: manifestStatus,
            conclusion: manifestJob.reason ?? check.conclusion,
        };
    }
    return check;
}
function checkFromManifestOnly(configuredName, manifest) {
    const manifestJob = findManifestJob(manifest, configuredName);
    if (!manifestJob)
        return undefined;
    const status = statusFromManifestJob(manifestJob);
    if (!status)
        return undefined;
    return {
        name: configuredName,
        status,
        conclusion: manifestJob.reason,
        detailsUrl: manifestJob.details_url,
        required: false,
    };
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
export function evaluateRequiredChecks(allChecks, ciConfig, manifest) {
    const requiredNames = ciConfig.required_checks;
    const optionalNames = ciConfig.optional_checks;
    const missingPolicy = ciConfig.missing_required;
    const evaluated = [];
    const seen = new Set();
    for (const reqName of requiredNames) {
        const match = allChecks.find((c) => checkNameMatches(reqName, c.name));
        if (match) {
            const resolved = applyManifestToCheck({ ...match, name: reqName, required: true }, manifest ?? undefined, reqName);
            evaluated.push(resolved);
            seen.add(match.name);
        }
        else if (manifest) {
            const fromManifest = checkFromManifestOnly(reqName, manifest);
            if (fromManifest) {
                evaluated.push({ ...fromManifest, name: reqName, required: true });
            }
            else {
                evaluated.push({
                    name: reqName,
                    status: missingPolicy === "skip" ? "skip" : "missing",
                    required: true,
                });
            }
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
            const resolved = applyManifestToCheck({ ...match, name: optName, required: false }, manifest ?? undefined, optName);
            evaluated.push(resolved);
            seen.add(match.name);
        }
        else if (manifest) {
            const fromManifest = checkFromManifestOnly(optName, manifest);
            if (fromManifest) {
                evaluated.push({ ...fromManifest, name: optName, required: false });
            }
            else {
                evaluated.push({
                    name: optName,
                    status: "missing",
                    required: false,
                });
            }
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
