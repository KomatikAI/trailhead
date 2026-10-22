import { describe, it, expect } from "vitest";
import {
  classifyFixLane,
  computeNextAction,
  hasRedLaneFindings,
  isAgentProvenanceType,
} from "../remediation-lanes.js";
import type { RemediationFix } from "../types.js";

function fix(
  code: string,
  severity: RemediationFix["severity"] = "blocking",
): RemediationFix {
  return {
    code,
    severity,
    title: code,
    detail: "detail",
    files: [],
    autofix_eligible: false,
  };
}

describe("classifyFixLane", () => {
  it("marks dangerous submission and policy codes as red", () => {
    expect(classifyFixLane("submission.mock_placeholder")).toBe("red");
    expect(classifyFixLane("submission.artifact_integrity")).toBe("red");
    expect(classifyFixLane("risk.sensitive_files")).toBe("red");
  });

  it("marks routine codes as yellow", () => {
    expect(classifyFixLane("risk.test_coverage")).toBe("yellow");
    expect(classifyFixLane("submission.context_freshness")).toBe("yellow");
    expect(classifyFixLane("ci.failed")).toBe("yellow");
  });

  it("classifies the ADR-011 remediation codes", () => {
    expect(classifyFixLane("risk.over_threshold")).toBe("red");
    expect(classifyFixLane("policy.finding")).toBe("red");
    expect(classifyFixLane("policy.finding.warn")).toBe("yellow");
    expect(classifyFixLane("policy.finding.advisory")).toBe("yellow");
  });
});

describe("isAgentProvenanceType", () => {
  it("treats non-human automation as agent provenance", () => {
    expect(isAgentProvenanceType("claude")).toBe(true);
    expect(isAgentProvenanceType("unknown")).toBe(true);
    expect(isAgentProvenanceType("human")).toBe(false);
    expect(isAgentProvenanceType(undefined)).toBe(false);
  });
});

describe("computeNextAction agent lane routing", () => {
  it("routes routine warn-only findings to fix_and_retry for agents", () => {
    expect(
      computeNextAction({
        releaseReady: false,
        blockingCount: 0,
        warnCount: 1,
        advisoryCount: 0,
        loopRound: 0,
        maxLoopRounds: 5,
        agentProvenance: true,
        fixes: [fix("risk.test_coverage", "warn")],
      }),
    ).toBe("fix_and_retry");
  });

  it("routes red-lane findings to human_review_required for agents", () => {
    expect(
      computeNextAction({
        releaseReady: false,
        blockingCount: 1,
        warnCount: 0,
        advisoryCount: 0,
        loopRound: 0,
        maxLoopRounds: 5,
        agentProvenance: true,
        fixes: [fix("submission.mock_placeholder")],
      }),
    ).toBe("human_review_required");
  });

  it("routes routine blocking findings to fix_and_retry for agents", () => {
    expect(
      computeNextAction({
        releaseReady: false,
        blockingCount: 1,
        warnCount: 0,
        advisoryCount: 0,
        loopRound: 0,
        maxLoopRounds: 5,
        agentProvenance: true,
        fixes: [fix("risk.test_coverage")],
      }),
    ).toBe("fix_and_retry");
  });

  it("keeps human warn-only PRs on human_review_required (legacy)", () => {
    expect(
      computeNextAction({
        releaseReady: false,
        blockingCount: 0,
        warnCount: 1,
        advisoryCount: 0,
        loopRound: 0,
        maxLoopRounds: 5,
        agentProvenance: false,
        fixes: [fix("risk.test_coverage", "warn")],
      }),
    ).toBe("human_review_required");
  });

  it("requires human review when release-ready but red-lane findings remain", () => {
    expect(
      computeNextAction({
        releaseReady: true,
        blockingCount: 0,
        warnCount: 1,
        advisoryCount: 0,
        loopRound: 2,
        maxLoopRounds: 5,
        agentProvenance: true,
        fixes: [fix("risk.sensitive_files", "warn")],
      }),
    ).toBe("human_review_required");
    expect(hasRedLaneFindings([fix("risk.sensitive_files", "warn")])).toBe(true);
  });
});
