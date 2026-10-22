import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRepoConfigContent } from "../config-core.js";
import { matchContext } from "../context-matcher.js";
import { evaluateRequiredChecks, normalizeCheckRuns } from "../ci-core.js";
import { computeReleaseReady } from "../release-ready.js";

const config = parseRepoConfigContent(
  readFileSync(new URL("../../.trailhead.yml", import.meta.url), "utf8"),
);

describe.each(["dev", "staging", "main"])("repository readiness on %s", (baseRef) => {
  it("blocks every failed or missing required job, including human security review", () => {
    expect(config).not.toBeNull();
    const context = matchContext(config!.contexts, {
      baseRef,
      headRef: "codex/review",
      labels: [],
    });
    expect(context).not.toBeNull();
    const ci = context!.context.ci;
    expect(ci.required_checks).toContain("security-guard");
    expect(ci.required_checks).toContain("Cloud PostgreSQL contracts");
    expect(ci.required_checks).toContain("Website lint, test & build");
    const runs = ci.required_checks.map((name) => ({
      name,
      status: "completed",
      conclusion: "success",
    }));
    const ready = (checks: typeof runs) =>
      computeReleaseReady({
        gateMode: "release-ready",
        gateDecision: "allow",
        riskScore: 20,
        riskThreshold: 90,
        healthScore: 100,
        healthChecksConfigured: false,
        freezeActive: false,
        ciSummary: evaluateRequiredChecks(normalizeCheckRuns(checks), ci),
      }).releaseReady;
    expect(ready(runs)).toBe(true);
    for (const name of ci.required_checks) {
      expect(
        ready(runs.map((r) => (r.name === name ? { ...r, conclusion: "failure" } : r))),
        name,
      ).toBe(false);
      expect(ready(runs.filter((r) => r.name !== name)), name).toBe(false);
    }
  });
});
