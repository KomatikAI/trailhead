import { describe, expect, it } from "vitest";
import { resolveAgentProvenanceId } from "../agent-provenance.js";
import type { GateEvaluation } from "../types.js";

function evaluation(pr: GateEvaluation["pr"]): Pick<GateEvaluation, "pr"> {
  return { pr };
}

describe("resolveAgentProvenanceId", () => {
  it("prefers provenance.source", () => {
    expect(
      resolveAgentProvenanceId(
        evaluation({
          headRef: "agent/frontend-dev/fix-nav",
          provenance: { type: "claude", confidence: 0.9, source: "frontend-dev" },
        }),
      ),
    ).toBe("frontend-dev");
  });

  it("parses agent branch headRef", () => {
    expect(
      resolveAgentProvenanceId(
        evaluation({
          headRef: "agent/pipeline-ops/db-health",
          provenance: { type: "unknown", confidence: 0.5 },
        }),
      ),
    ).toBe("pipeline-ops");
  });

  it("falls back to non-human provenance type", () => {
    expect(
      resolveAgentProvenanceId(
        evaluation({
          provenance: { type: "claude", confidence: 0.8 },
        }),
      ),
    ).toBe("claude");
  });

  it("returns null for human PRs", () => {
    expect(
      resolveAgentProvenanceId(
        evaluation({
          provenance: { type: "human", confidence: 1 },
        }),
      ),
    ).toBeNull();
  });
});
