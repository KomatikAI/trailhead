// Pure loop bookkeeping helpers — no framework dependencies.

import type { GateEvaluation, Remediation } from "./types.js";

export type PreviousEvaluationSnapshot = Pick<GateEvaluation, "id" | "remediation">;

export function resolveLoopRound(
  previous: PreviousEvaluationSnapshot | null | undefined,
): number {
  if (!previous) return 0;
  return (previous.remediation?.loop_round ?? 0) + 1;
}

export function parseAgentIdFromHeadRef(headRef: string | undefined): string | null {
  if (!headRef) return null;
  const match = headRef.match(/^agent\/([a-z0-9-]+)\//);
  return match?.[1] ?? null;
}

export function parsePreviousEvaluationRow(
  row: unknown,
): PreviousEvaluationSnapshot | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;

  let remediation: Remediation | undefined;
  if (record.remediation && typeof record.remediation === "object") {
    remediation = record.remediation as Remediation;
  }

  return { id, remediation };
}

export function pickLatestPreviousEvaluation(
  rows: unknown[],
  excludeEvaluationId?: string,
): PreviousEvaluationSnapshot | null {
  for (const row of rows) {
    const parsed = parsePreviousEvaluationRow(row);
    if (!parsed) continue;
    if (excludeEvaluationId && parsed.id === excludeEvaluationId) continue;
    return parsed;
  }
  return null;
}
