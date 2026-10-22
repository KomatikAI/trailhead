// Pure loop bookkeeping helpers — no framework dependencies.
export function resolveLoopRound(previous) {
    if (!previous)
        return 0;
    return (previous.remediation?.loop_round ?? 0) + 1;
}
export function parseAgentIdFromHeadRef(headRef) {
    if (!headRef)
        return null;
    const match = headRef.match(/^agent\/([a-z0-9-]+)\//);
    return match?.[1] ?? null;
}
function pick(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined && value !== null)
            return value;
    }
    return undefined;
}
function readFindingIds(record) {
    const direct = pick(record, "enumerated_findings", "enumeratedFindings");
    const brief = pick(record, "release_brief", "releaseBrief");
    const raw = direct ??
        (brief && typeof brief === "object"
            ? brief.findings
            : undefined);
    if (!Array.isArray(raw))
        return undefined;
    const ids = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object")
            continue;
        const id = entry.id;
        if (typeof id === "string")
            ids.push(id);
    }
    return ids;
}
export function parsePreviousEvaluationRow(row) {
    if (!row || typeof row !== "object")
        return null;
    const record = row;
    const id = typeof record.id === "string" ? record.id : null;
    if (!id)
        return null;
    let remediation;
    if (record.remediation && typeof record.remediation === "object") {
        remediation = record.remediation;
    }
    const snapshot = { id, remediation };
    const riskScore = pick(record, "risk_score", "riskScore");
    if (typeof riskScore === "number" && Number.isFinite(riskScore)) {
        snapshot.riskScore = riskScore;
    }
    const gateDecision = pick(record, "gate_decision", "gateDecision");
    if (gateDecision === "allow" || gateDecision === "warn" || gateDecision === "block") {
        snapshot.gateDecision = gateDecision;
    }
    const releaseReady = pick(record, "release_ready", "releaseReady");
    if (typeof releaseReady === "boolean") {
        snapshot.releaseReady = releaseReady;
    }
    const findingIds = readFindingIds(record);
    if (findingIds !== undefined) {
        snapshot.findingIds = findingIds;
    }
    return snapshot;
}
export function pickLatestPreviousEvaluation(rows, excludeEvaluationId) {
    for (const row of rows) {
        const parsed = parsePreviousEvaluationRow(row);
        if (!parsed)
            continue;
        if (excludeEvaluationId && parsed.id === excludeEvaluationId)
            continue;
        return parsed;
    }
    return null;
}
