import { describe, expect, it } from "vitest";
import { resolveEvaluationTarget } from "../github-event.js";

describe("resolveEvaluationTarget", () => {
  it("uses the PR head SHA instead of GitHub's synthetic merge SHA", () => {
    expect(
      resolveEvaluationTarget({
        sha: "synthetic-merge-sha",
        payload: {
          pull_request: {
            number: 327,
            head: { sha: "pull-request-head-sha" },
          },
        },
      }),
    ).toEqual({ commitSha: "pull-request-head-sha", prNumber: 327 });
  });

  it("falls back to the event SHA when a PR payload has no head SHA", () => {
    expect(
      resolveEvaluationTarget({
        sha: "event-sha",
        payload: { pull_request: { number: 327 } },
      }),
    ).toEqual({ commitSha: "event-sha", prNumber: 327 });
  });

  it("keeps the event SHA for non-PR and merge-queue events", () => {
    expect(resolveEvaluationTarget({ sha: "push-sha", payload: {} })).toEqual({
      commitSha: "push-sha",
      prNumber: undefined,
    });
    expect(resolveEvaluationTarget({ sha: "merge-group-sha", payload: {} })).toEqual({
      commitSha: "merge-group-sha",
      prNumber: undefined,
    });
  });
});
