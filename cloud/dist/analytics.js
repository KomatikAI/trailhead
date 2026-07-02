function inWindow(iso, since) {
    return new Date(iso).getTime() >= since.getTime();
}
function filterEvaluations(rows, options) {
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - options.days * 86_400_000);
    return rows.filter((row) => inWindow(row.receivedAt, since) &&
        (!options.repoId || row.repoId === options.repoId));
}
function filterDeployEvents(rows, options) {
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - options.days * 86_400_000);
    return rows
        .map((r) => r.payload)
        .filter((event) => inWindow(event.timestamp, since) &&
        (!options.repoId || !event.repoId || event.repoId === options.repoId));
}
export function computeRiskTrend(rows, options) {
    const filtered = filterEvaluations(rows, options);
    const buckets = new Map();
    for (const row of filtered) {
        const day = row.receivedAt.slice(0, 10);
        const list = buckets.get(day) ?? [];
        list.push(row.riskScore);
        buckets.set(day, list);
    }
    return [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, scores]) => ({
        date,
        avgRisk: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
        count: scores.length,
    }));
}
export function computeReleaseReadyStats(rows, options) {
    const filtered = filterEvaluations(rows, options);
    let pass = 0;
    let fail = 0;
    let unknown = 0;
    const byContext = {};
    for (const row of filtered) {
        const contextName = typeof row.context === "object" &&
            row.context !== null &&
            "name" in row.context &&
            typeof row.context.name === "string"
            ? row.context.name
            : "default";
        if (!byContext[contextName]) {
            byContext[contextName] = { pass: 0, fail: 0 };
        }
        if (row.releaseReady === true) {
            pass += 1;
            byContext[contextName].pass += 1;
        }
        else if (row.releaseReady === false) {
            fail += 1;
            byContext[contextName].fail += 1;
        }
        else {
            unknown += 1;
        }
    }
    const known = pass + fail;
    return {
        pass,
        fail,
        unknown,
        passRate: known > 0 ? Math.round((pass / known) * 1000) / 10 : 0,
        byContext,
    };
}
export function computeCiFailureCorrelation(rows, options) {
    const filtered = filterEvaluations(rows, options);
    let ciFailed = 0;
    let releaseReadyFailed = 0;
    let both = 0;
    for (const row of filtered) {
        const ci = row.ci;
        const failedChecks = (ci?.failedCount ?? 0) > 0;
        const rrFailed = row.releaseReady === false;
        if (failedChecks)
            ciFailed += 1;
        if (rrFailed)
            releaseReadyFailed += 1;
        if (failedChecks && rrFailed)
            both += 1;
    }
    return {
        total: filtered.length,
        ciFailed,
        releaseReadyFailed,
        both,
        ciFailedOnly: ciFailed - both,
        releaseReadyFailedOnly: releaseReadyFailed - both,
    };
}
export function computeDoraProxy(evaluations, deployEvents, options) {
    const evalRows = filterEvaluations(evaluations, options);
    const deployRows = filterDeployEvents(deployEvents, options);
    const weeks = Math.max(options.days / 7, 1);
    const deploymentFrequencyPerWeek = Math.round((deployRows.length / weeks) * 10) / 10;
    const outcomes = deployRows.filter((e) => e.status !== "cancelled");
    const failures = outcomes.filter((e) => e.status === "failure").length;
    const changeFailureRate = outcomes.length > 0 ? Math.round((failures / outcomes.length) * 1000) / 10 : 0;
    const avgRiskScore = evalRows.length > 0
        ? Math.round(evalRows.reduce((sum, row) => sum + row.riskScore, 0) / evalRows.length)
        : 0;
    let rating = "Low";
    if (deploymentFrequencyPerWeek >= 1 && changeFailureRate <= 15 && avgRiskScore <= 50) {
        rating = "Elite";
    }
    else if (changeFailureRate <= 20 && avgRiskScore <= 65) {
        rating = "High";
    }
    else if (changeFailureRate <= 30) {
        rating = "Medium";
    }
    return {
        deploymentFrequencyPerWeek,
        changeFailureRate,
        avgLeadTimeHours: null,
        avgRiskScore,
        rating,
    };
}
export function computeCfrStats(deployEvents, options) {
    const rows = filterDeployEvents(deployEvents, options);
    const successes = rows.filter((e) => e.status === "success").length;
    const failures = rows.filter((e) => e.status === "failure").length;
    const cancelled = rows.filter((e) => e.status === "cancelled").length;
    const known = successes + failures;
    return {
        successes,
        failures,
        cancelled,
        cfr: known > 0 ? Math.round((failures / known) * 1000) / 10 : 0,
    };
}
function parseAgentIdFromHeadRef(headRef) {
    if (!headRef)
        return null;
    const match = headRef.match(/^agent\/([a-z0-9-]+)\//);
    return match?.[1] ?? null;
}
function median(values) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
        : sorted[mid];
}
export function computeAgentLoopEfficiency(rows, options) {
    const filtered = filterEvaluations(rows, options);
    const buckets = new Map();
    for (const row of filtered) {
        const headRef = typeof row.pr === "object" &&
            row.pr !== null &&
            "headRef" in row.pr &&
            typeof row.pr.headRef === "string"
            ? row.pr.headRef
            : undefined;
        const agentId = parseAgentIdFromHeadRef(headRef);
        if (!agentId)
            continue;
        const remediation = row.remediation;
        const bucket = buckets.get(agentId) ?? { ready: 0, blocked: 0, rounds: [] };
        if (row.releaseReady === true || remediation?.next_action === "ready_to_merge") {
            bucket.ready += 1;
            if (typeof remediation?.loop_round === "number") {
                bucket.rounds.push(remediation.loop_round);
            }
        }
        else if (row.gateDecision === "block") {
            bucket.blocked += 1;
        }
        buckets.set(agentId, bucket);
    }
    const agents = [...buckets.entries()]
        .map(([agentId, stats]) => ({
        agentId,
        evaluations: stats.ready + stats.blocked,
        readyCount: stats.ready,
        blockedCount: stats.blocked,
        medianRoundsToReady: median(stats.rounds),
    }))
        .sort((a, b) => a.agentId.localeCompare(b.agentId));
    const fleetRounds = agents.flatMap((row) => row.medianRoundsToReady === null ? [] : [row.medianRoundsToReady]);
    return {
        windowDays: options.days,
        repoId: options.repoId ?? null,
        agents,
        fleetMedianRoundsToReady: median(fleetRounds),
    };
}
export function buildDashboardAnalytics(evaluations, deployEvents, options) {
    return {
        windowDays: options.days,
        repoId: options.repoId ?? null,
        riskTrend: computeRiskTrend(evaluations, options),
        releaseReady: computeReleaseReadyStats(evaluations, options),
        ciCorrelation: computeCiFailureCorrelation(evaluations, options),
        dora: computeDoraProxy(evaluations, deployEvents, options),
        cfr: computeCfrStats(deployEvents, options),
        agentLoopEfficiency: computeAgentLoopEfficiency(evaluations, options),
    };
}
