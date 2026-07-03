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
    return { id, remediation };
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
