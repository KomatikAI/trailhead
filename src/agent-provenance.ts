import type { GateEvaluation } from "./types.js";

/** Denormalised agent id for evaluation store group-by (A5). */
export function resolveAgentProvenanceId(
  evaluation: Pick<GateEvaluation, "pr">,
): string | null {
  const pr = evaluation.pr;
  if (!pr) return null;

  const source = pr.provenance?.source?.trim();
  if (source) return source;

  const headRef = pr.headRef;
  if (headRef) {
    const match = headRef.match(/^agent\/([a-z0-9-]+)\//i);
    if (match?.[1]) return match[1];
  }

  const type = pr.provenance?.type;
  if (type && type !== "human") return type;

  return null;
}
