import { describe, expect, it } from "vitest";
import {
  mergeFeedbackIntoMetrics,
  resolveAgentIdFromFeedbackEvent,
  rollupFeedbackForAgent,
} from "../agent-trust-feedback.js";

describe("agent-trust-feedback", () => {
  it("resolves agent id from head_ref", () => {
    expect(
      resolveAgentIdFromFeedbackEvent({
        outcome: "ci_fail",
        head_ref: "agent/pixel/suggestions/pack/ui",
        observed_at: "2026-05-29T00:00:00.000Z",
      }),
    ).toBe("pixel");
  });

  it("rolls up CI failure into feedback counts", () => {
    const rollup = rollupFeedbackForAgent(
      [
        {
          agent_id: "forge",
          outcome: "ci_fail",
          observed_at: "2026-05-29T00:00:00.000Z",
        },
      ],
      "forge",
    );
    expect(rollup.feedback.ciFailures).toBe(1);
    expect(rollup.attributed).toBe(1);
  });

  it("rolls up revert and remediation rounds", () => {
    const rollup = rollupFeedbackForAgent(
      [
        {
          agent_id: "vault",
          outcome: "revert",
          observed_at: "2026-05-29T00:00:00.000Z",
        },
        {
          agent_id: "vault",
          outcome: "rounds_to_green",
          remediation_rounds: 2,
          observed_at: "2026-05-29T01:00:00.000Z",
        },
      ],
      "vault",
    );
    expect(rollup.feedback.reverts).toBe(1);
    expect(rollup.remediationRoundsToReady).toEqual([2]);
  });

  it("does not attribute events without agent correlation", () => {
    const rollup = rollupFeedbackForAgent(
      [
        {
          outcome: "ci_fail",
          project_slug: "pack",
          observed_at: "2026-05-29T00:00:00.000Z",
        },
      ],
      "pixel",
    );
    expect(rollup.attributed).toBe(0);
    expect(rollup.unattributed).toBe(1);
  });

  it("merges rollup into AgentTrustMetrics counters", () => {
    const merged = mergeFeedbackIntoMetrics(
      {
        revertCount: 0,
        humanReviewRequiredCount: 1,
        policyViolationCount: 0,
        remediationRoundsToReady: [1],
        feedback: { ciFailures: 0, reverts: 0, humanReview: 0 },
      },
      {
        feedback: { ciFailures: 1, reverts: 1, humanReview: 0 },
        remediationRoundsToReady: [3],
        attributed: 2,
        unattributed: 0,
      },
    );
    expect(merged.revertCount).toBe(1);
    expect(merged.humanReviewRequiredCount).toBe(2);
    expect(merged.policyViolationCount).toBe(1);
    expect(merged.remediationRoundsToReady).toEqual([1, 3]);
    expect(merged.feedback?.ciFailures).toBe(1);
  });
});
