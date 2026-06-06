import type { GateEvaluation } from "./types.js";

/** Provenance `source` values that describe detection heuristics, not agent identity. */
const DETECTION_METHOD_SOURCES = new Set(["author/branch/commit-signals"]);

function isAgentIdentitySource(source: string): boolean {
  return !DETECTION_METHOD_SOURCES.has(source);
}

/** Denormalised agent id for evaluation store group-by (A5). */
export function resolveAgentProvenanceId(
  evaluation: Pick<GateEvaluation, "pr">,
): string | null {
  const pr = evaluation.pr;
  if (!pr) return null;

  const headRef = pr.headRef;
  if (headRef) {
    const match = headRef.match(/^agent\/([a-z0-9-]+)\//i);
    if (match?.[1]) return match[1];
  }

  const type = pr.provenance?.type;
  if (type && type !== "human" && type !== "unknown") return type;

  const source = pr.provenance?.source?.trim();
  if (source && isAgentIdentitySource(source)) return source;

  return null;
}
