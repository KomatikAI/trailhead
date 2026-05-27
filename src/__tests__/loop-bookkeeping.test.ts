import { describe, expect, it } from "vitest";

import {
  parseAgentIdFromHeadRef,
  parsePreviousEvaluationRow,
  pickLatestPreviousEvaluation,
  resolveLoopRound,
} from "../loop-bookkeeping.js";

describe("loop-bookkeeping", () => {
  it("resolveLoopRound starts at 0 without previous evaluation", () => {
    expect(resolveLoopRound(null)).toBe(0);
    expect(resolveLoopRound(undefined)).toBe(0);
  });

  it("resolveLoopRound increments from previous remediation loop_round", () => {
    expect(
      resolveLoopRound({
        id: "eval-1",
        remediation: {
          schema: "trailhead.remediation.v1",
          release_ready: false,
          fixes: [],
          blocking_count: 1,
          warn_count: 0,
          advisory_count: 0,
          autofix_eligible_count: 0,
          loop_round: 2,
          max_loop_rounds: 3,
          fixes_resolved: [],
          fixes_introduced: [],
          next_action: "fix_and_retry",
        },
      }),
    ).toBe(3);
  });

  it("parsePreviousEvaluationRow reads remediation blob", () => {
    const parsed = parsePreviousEvaluationRow({
      id: "eval-9",
      remediation: {
        schema: "trailhead.remediation.v1",
        loop_round: 1,
        fixes: [
          { code: "ci.failed", severity: "blocking", title: "x", detail: "x", files: [] },
        ],
      },
    });
    expect(parsed?.id).toBe("eval-9");
    expect(parsed?.remediation?.loop_round).toBe(1);
  });

  it("pickLatestPreviousEvaluation skips excluded id", () => {
    const picked = pickLatestPreviousEvaluation(
      [{ id: "current" }, { id: "prev", remediation: { loop_round: 0 } }],
      "current",
    );
    expect(picked?.id).toBe("prev");
  });

  it("parseAgentIdFromHeadRef extracts fleet agent id", () => {
    expect(parseAgentIdFromHeadRef("agent/frontend-dev/fix-nav")).toBe("frontend-dev");
    expect(parseAgentIdFromHeadRef("claude/foo")).toBeNull();
  });
});
