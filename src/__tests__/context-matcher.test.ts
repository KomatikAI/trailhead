import { describe, it, expect } from "vitest";
import { matchContext, resolveGateMode } from "../context-matcher.js";
import type { TrailheadContext } from "../types.js";

const contexts: TrailheadContext[] = [
  {
    name: "feature",
    match: { base_branch: ["dev"], head_branch: [], labels: [] },
    thresholds: { risk: 70 },
    ci: { required_checks: ["Build"], optional_checks: [], missing_required: "fail" },
  },
  {
    name: "promotion",
    match: { base_branch: ["staging", "main"], head_branch: [], labels: [] },
    thresholds: { risk: 95 },
    environment: "production",
    ci: {
      required_checks: ["Build", "Playwright"],
      optional_checks: [],
      missing_required: "fail",
    },
  },
];

describe("matchContext", () => {
  it("matches feature PR to dev base", () => {
    const result = matchContext(contexts, {
      baseRef: "dev",
      headRef: "feature/foo",
      labels: [],
    });
    expect(result?.matched.name).toBe("feature");
    expect(result?.context.thresholds.risk).toBe(70);
  });

  it("matches promotion PR to staging base", () => {
    const result = matchContext(contexts, {
      baseRef: "staging",
      headRef: "dev",
      labels: [],
    });
    expect(result?.matched.name).toBe("promotion");
    expect(result?.matched.environment).toBe("production");
  });

  it("returns null when no context matches", () => {
    const result = matchContext(contexts, {
      baseRef: "experimental",
      headRef: "feature/foo",
      labels: [],
    });
    expect(result).toBeNull();
  });

  it("respects label matching when configured", () => {
    const withLabels: TrailheadContext[] = [
      {
        name: "hotfix",
        match: { base_branch: [], head_branch: [], labels: ["hotfix"] },
        thresholds: {},
        ci: { required_checks: [], optional_checks: [], missing_required: "fail" },
      },
      ...contexts,
    ];
    const result = matchContext(withLabels, {
      baseRef: "dev",
      headRef: "fix/urgent",
      labels: ["hotfix"],
    });
    expect(result?.matched.name).toBe("hotfix");
  });
});

describe("resolveGateMode", () => {
  it("defaults v1 configs to risk-only", () => {
    expect(resolveGateMode(undefined, 1)).toBe("risk-only");
  });

  it("defaults v2 configs to release-ready", () => {
    expect(resolveGateMode(undefined, 2)).toBe("release-ready");
  });

  it("input overrides repo config", () => {
    expect(resolveGateMode("risk-only", 2, "release-ready")).toBe("release-ready");
  });

  it("uses repo gate.mode when no input", () => {
    expect(resolveGateMode("advisory", 2)).toBe("advisory");
  });
});
