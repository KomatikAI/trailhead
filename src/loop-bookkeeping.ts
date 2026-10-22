// Pure loop bookkeeping helpers — no framework dependencies.

import type { GateDecision, Remediation } from "./types.js";

/**
 * What the store returns about the previous evaluation of a PR. `id`/`remediation`
 * drive loop bookkeeping; the rest is ADR-011 §1 delta material and is present only
 * when the backend actually returned those columns — every consumer must treat the
 * optional fields as "unknown", never as "unchanged".
 */
export interface PreviousEvaluationSnapshot {
  id: string;
  remediation?: Remediation;
  riskScore?: number;
  gateDecision?: GateDecision;
  releaseReady?: boolean;
  /** Ids of the previous evaluation's enumerated findings (ADR-011 §1). */
  findingIds?: string[];
}

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

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function readFindingIds(record: Record<string, unknown>): string[] | undefined {
  const direct = pick(record, "enumerated_findings", "enumeratedFindings");
  const brief = pick(record, "release_brief", "releaseBrief");
  const raw =
    direct ??
    (brief && typeof brief === "object"
      ? (brief as Record<string, unknown>).findings
      : undefined);
  if (!Array.isArray(raw)) return undefined;
  const ids: string[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as Record<string, unknown>).id;
    if (typeof id === "string") ids.push(id);
  }
  return ids;
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

  const snapshot: PreviousEvaluationSnapshot = { id, remediation };

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
