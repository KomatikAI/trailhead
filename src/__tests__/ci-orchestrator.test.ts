import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";
import type * as github from "@actions/github";
import {
  classifyCheck,
  evaluateRequiredChecks,
  normalizeCheckRuns,
  waitForChecks,
} from "../ci-orchestrator.js";
import type { ContextCiConfig } from "../types.js";

describe("classifyCheck", () => {
  it("maps success to pass", () => {
    expect(classifyCheck("completed", "success")).toBe("pass");
  });

  it("maps skipped to skip", () => {
    expect(classifyCheck("completed", "skipped")).toBe("skip");
  });

  it("maps failure to fail", () => {
    expect(classifyCheck("completed", "failure")).toBe("fail");
  });

  it("maps in_progress to pending", () => {
    expect(classifyCheck("in_progress", null)).toBe("pending");
  });
});

describe("normalizeCheckRuns", () => {
  it("excludes Trailhead self-checks", () => {
    const checks = normalizeCheckRuns([
      { name: "Build", status: "completed", conclusion: "success" },
      { name: "Trailhead — Release Ready", status: "completed", conclusion: "success" },
    ]);
    expect(checks.map((c) => c.name)).toEqual(["Build"]);
  });
});

describe("evaluateRequiredChecks", () => {
  const allChecks = normalizeCheckRuns([
    { name: "CI Gate", status: "completed", conclusion: "success" },
    { name: "Build / lint", status: "completed", conclusion: "success" },
    { name: "Playwright", status: "completed", conclusion: "skipped" },
  ]);

  it("passes when all required checks pass or skip", () => {
    const summary = evaluateRequiredChecks(allChecks, {
      required_checks: ["CI Gate", "Build"],
      optional_checks: ["Playwright"],
      missing_required: "fail",
    });
    expect(summary.allRequiredPassed).toBe(true);
    expect(summary.failedCount).toBe(0);
  });

  it("fails when required check is missing and policy is fail", () => {
    const summary = evaluateRequiredChecks(allChecks, {
      required_checks: ["Security Gate"],
      optional_checks: [],
      missing_required: "fail",
    });
    expect(summary.allRequiredPassed).toBe(false);
    expect(summary.missingCount).toBe(1);
  });

  it("allows missing when policy is skip", () => {
    const summary = evaluateRequiredChecks(allChecks, {
      required_checks: ["Security Gate"],
      optional_checks: [],
      missing_required: "skip",
    });
    expect(summary.allRequiredPassed).toBe(true);
  });

  it("prefix-matches check names", () => {
    const summary = evaluateRequiredChecks(allChecks, {
      required_checks: ["Build"],
      optional_checks: [],
      missing_required: "fail",
    });
    const buildCheck = summary.checks.find((c) => c.name === "Build");
    expect(buildCheck?.status).toBe("pass");
  });
});

describe("waitForChecks", () => {
  type CheckRunFixture = { name: string; status: string; conclusion: string | null };

  /** Each call to `listForRef` returns the next page in `pages` (the last page repeats). */
  function makeOctokit(pages: CheckRunFixture[][]) {
    const listForRef = vi.fn().mockImplementation(async () => {
      const call = listForRef.mock.calls.length - 1;
      const page = pages[Math.min(call, pages.length - 1)];
      return { data: { check_runs: page } };
    });
    return {
      octokit: {
        rest: { checks: { listForRef } },
      } as unknown as ReturnType<typeof github.getOctokit>,
      listForRef,
    };
  }

  const baseCiConfig: ContextCiConfig = {
    required_checks: ["Build"],
    optional_checks: [],
    missing_required: "fail",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls until a pending required check resolves, well inside the timeout", async () => {
    const { octokit, listForRef } = makeOctokit([
      [{ name: "Build", status: "in_progress", conclusion: null }],
      [{ name: "Build", status: "in_progress", conclusion: null }],
      [{ name: "Build", status: "completed", conclusion: "success" }],
    ]);

    const resultPromise = waitForChecks({
      octokit,
      owner: "o",
      repo: "r",
      headSha: "sha",
      ciConfig: baseCiConfig,
      timeoutMinutes: 30,
      pollIntervalSeconds: 15,
    });

    // Two polls are needed to reach the third (passing) page.
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);

    const result = await resultPromise;
    expect(result.pendingCount).toBe(0);
    expect(result.allRequiredPassed).toBe(true);
    expect(listForRef).toHaveBeenCalledTimes(3);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("returns on the very first fetch — no waiting — once a required check has genuinely failed, even with another still pending", async () => {
    const { octokit, listForRef } = makeOctokit([
      [
        { name: "Build", status: "completed", conclusion: "failure" },
        { name: "Deploy", status: "in_progress", conclusion: null },
      ],
    ]);

    const result = await waitForChecks({
      octokit,
      owner: "o",
      repo: "r",
      headSha: "sha",
      ciConfig: { ...baseCiConfig, required_checks: ["Build", "Deploy"] },
      // A long timeout: if fail-fast regressed, this would only return once
      // fake timers below were advanced past it — they never are.
      timeoutMinutes: 30,
      pollIntervalSeconds: 15,
    });

    expect(result.failedCount).toBe(1);
    expect(result.pendingCount).toBe(1);
    expect(listForRef).toHaveBeenCalledTimes(1);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("gives up and warns once the deadline passes with a required check still pending", async () => {
    const { octokit, listForRef } = makeOctokit([
      [{ name: "Build", status: "in_progress", conclusion: null }],
    ]);

    const resultPromise = waitForChecks({
      octokit,
      owner: "o",
      repo: "r",
      headSha: "sha",
      ciConfig: baseCiConfig,
      timeoutMinutes: 1,
      pollIntervalSeconds: 15,
    });

    // 1 minute / 15s polls: advance past the deadline.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
    }

    const result = await resultPromise;
    expect(result.pendingCount).toBe(1);
    expect(listForRef.mock.calls.length).toBeGreaterThan(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("CI wait timed out after 1m with 1 check(s) still pending"),
    );
  });
});
