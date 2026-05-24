import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRequiredChecks, normalizeCheckRuns } from "../ci-core.js";
import { matchContext } from "../context-matcher.js";
import { evaluateDeploymentGate } from "../deployment-gate.js";
import type { TrailheadContext } from "../types.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

interface CiScenario {
  id: string;
  runs: Array<{ name: string; status: string; conclusion: string | null }>;
  ciConfig: {
    required_checks: string[];
    optional_checks: string[];
    missing_required: "fail" | "skip";
  };
  expect: {
    allRequiredPassed?: boolean;
    failedCount?: number;
    pendingCount?: number;
    missingCount?: number;
  };
}

interface ContextCase {
  id: string;
  contexts: TrailheadContext[];
  pr: { baseRef: string; headRef: string; labels: string[] };
  expect: { name?: string; risk?: number; environment?: string } | null;
}

const ciScenarios = JSON.parse(
  readFileSync(path.join(fixturesDir, "ci-checks", "scenarios.json"), "utf-8"),
) as CiScenario[];

const contextCases = JSON.parse(
  readFileSync(path.join(fixturesDir, "context-matcher", "cases.json"), "utf-8"),
) as ContextCase[];

describe("CI check fixtures (E9.1)", () => {
  it.each(ciScenarios.map((s) => [s.id, s] as const))("scenario %s", (_id, scenario) => {
    const checks = normalizeCheckRuns(scenario.runs);
    const summary = evaluateRequiredChecks(checks, scenario.ciConfig);

    if (scenario.expect.allRequiredPassed !== undefined) {
      expect(summary.allRequiredPassed).toBe(scenario.expect.allRequiredPassed);
    }
    if (scenario.expect.failedCount !== undefined) {
      expect(summary.failedCount).toBe(scenario.expect.failedCount);
    }
    if (scenario.expect.pendingCount !== undefined) {
      expect(summary.pendingCount).toBe(scenario.expect.pendingCount);
    }
    if (scenario.expect.missingCount !== undefined) {
      expect(summary.missingCount).toBe(scenario.expect.missingCount);
    }
  });
});

describe("Context matcher fixtures (E9.2)", () => {
  it.each(contextCases.map((c) => [c.id, c] as const))("case %s", (_id, testCase) => {
    const result = matchContext(testCase.contexts, testCase.pr);

    if (testCase.expect === null) {
      expect(result).toBeNull();
      return;
    }

    expect(result?.matched.name).toBe(testCase.expect.name);
    if (testCase.expect.risk !== undefined) {
      expect(result?.context.thresholds.risk).toBe(testCase.expect.risk);
    }
    if (testCase.expect.environment !== undefined) {
      expect(result?.matched.environment).toBe(testCase.expect.environment);
    }
  });
});

describe("App/Action deployment gate parity (E7.2 / E9.4)", () => {
  const highRiskFiles = [
    { filename: "src/auth/login.ts", changes: 200 },
    { filename: "src/payment/billing.ts", changes: 150 },
    { filename: "migrations/001_users.sql", changes: 80 },
  ];

  it("blocks release-ready when risk exceeds threshold", () => {
    const result = evaluateDeploymentGate({
      files: highRiskFiles,
      gateMode: "release-ready",
      riskThreshold: 50,
      warnThreshold: 35,
      ciSummary: {
        checks: [{ name: "Build", status: "pass", required: true }],
        allRequiredPassed: true,
        pendingCount: 0,
        failedCount: 0,
        missingCount: 0,
      },
      prRef: "PR #99",
      environment: "production",
    });

    expect(result.approved).toBe(false);
    expect(result.releaseReady).toBe(false);
    expect(result.comment).toContain("NOT RELEASE READY");
  });

  it("approves release-ready when CI green and risk low", () => {
    const result = evaluateDeploymentGate({
      files: [{ filename: "docs/readme.md", changes: 5 }],
      gateMode: "release-ready",
      riskThreshold: 70,
      warnThreshold: 55,
      ciSummary: {
        checks: [{ name: "Build", status: "pass", required: true }],
        allRequiredPassed: true,
        pendingCount: 0,
        failedCount: 0,
        missingCount: 0,
      },
      prRef: "PR #1",
      environment: "staging",
    });

    expect(result.approved).toBe(true);
    expect(result.releaseReady).toBe(true);
    expect(result.comment).toContain("RELEASE READY");
  });

  it("advisory mode always approves even when risk is high", () => {
    const result = evaluateDeploymentGate({
      files: highRiskFiles,
      gateMode: "advisory",
      riskThreshold: 50,
      warnThreshold: 35,
      ciSummary: {
        checks: [{ name: "Build", status: "fail", required: true }],
        allRequiredPassed: false,
        pendingCount: 0,
        failedCount: 1,
        missingCount: 0,
      },
      prRef: "PR #99",
      environment: "production",
    });

    expect(result.approved).toBe(true);
    expect(result.releaseReady).toBe(false);
  });
});
