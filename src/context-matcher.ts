import { matchesGlobs } from "./risk-engine.js";
import type { TrailheadContext, MatchedContext } from "./types.js";

export interface PrMatchContext {
  baseRef: string;
  headRef: string;
  labels: string[];
}

function branchMatches(patterns: string[], branch: string): boolean {
  if (patterns.length === 0) return true;
  return matchesGlobs(branch, patterns);
}

function labelsMatch(required: string[], prLabels: string[]): boolean {
  if (required.length === 0) return true;
  const normalized = new Set(prLabels.map((l) => l.toLowerCase()));
  return required.every((label) => normalized.has(label.toLowerCase()));
}

function contextMatches(ctx: TrailheadContext, pr: PrMatchContext): boolean {
  const { match } = ctx;
  if (!branchMatches(match.base_branch, pr.baseRef)) return false;
  if (!branchMatches(match.head_branch, pr.headRef)) return false;
  if (!labelsMatch(match.labels, pr.labels)) return false;
  return true;
}

/**
 * Returns the first matching context (declaration order wins).
 */
export function matchContext(
  contexts: TrailheadContext[],
  pr: PrMatchContext,
): { context: TrailheadContext; matched: MatchedContext } | null {
  for (const ctx of contexts) {
    if (!contextMatches(ctx, pr)) continue;
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

export function resolveGateMode(
  repoGateMode: string | undefined,
  schemaVersion: number,
  inputGateMode?: string,
): "release-ready" | "advisory" | "risk-only" {
  if (
    inputGateMode === "release-ready" ||
    inputGateMode === "advisory" ||
    inputGateMode === "risk-only"
  ) {
    return inputGateMode;
  }
  if (
    repoGateMode === "release-ready" ||
    repoGateMode === "advisory" ||
    repoGateMode === "risk-only"
  ) {
    return repoGateMode;
  }
  return schemaVersion >= 2 ? "release-ready" : "risk-only";
}
