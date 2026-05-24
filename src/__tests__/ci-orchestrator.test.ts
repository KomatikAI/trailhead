import { describe, it, expect } from "vitest";
import {
  classifyCheck,
  evaluateRequiredChecks,
  normalizeCheckRuns,
} from "../ci-orchestrator.js";

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
