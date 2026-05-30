import { describe, expect, it } from "vitest";
import {
  applyDetectorPolicy,
  buildRenamePatterns,
  getSubmissionConfigWarnings,
  resolveDetectorPolicy,
} from "../submission-checks/detector-policy.js";
import type { SubmissionConfig } from "../types.js";

describe("submission detector policy", () => {
  it("warns on unknown detector keys", () => {
    const warnings = getSubmissionConfigWarnings({
      detectors: {
        not_a_real_detector: { enabled: false },
      },
    } as Partial<SubmissionConfig>);
    expect(warnings[0]).toContain("not_a_real_detector");
  });

  it("merges Komatik defaults with custom rename patterns", () => {
    const patterns = buildRenamePatterns(
      {
        rename_patterns: [{ old: "AcmeCorp", new: "BetaInc" }],
      },
      { includeKomatikDefaults: true },
    );
    expect(patterns.some((p) => p.oldName === "DeployGuard")).toBe(true);
    expect(patterns.some((p) => p.oldName === "AcmeCorp")).toBe(true);
  });

  it("disables detectors via policy", () => {
    const { policy } = resolveDetectorPolicy({
      detectors: { mock_placeholder: { enabled: false } },
    });
    const check = applyDetectorPolicy(
      "mock_placeholder",
      {
        code: "mock_placeholder",
        severity: "blocking",
        title: "mock",
        detail: "mock",
        files: [],
        autofix_eligible: false,
      },
      policy,
    );
    expect(check).toBeNull();
  });

  it("maps block severity override to blocking", () => {
    const { policy } = resolveDetectorPolicy({
      detectors: { context_freshness: { severity: "block" } },
    });
    const check = applyDetectorPolicy(
      "context_freshness",
      {
        code: "context_freshness",
        severity: "warn",
        title: "stale",
        detail: "stale",
        files: [],
        autofix_eligible: false,
      },
      policy,
    );
    expect(check?.severity).toBe("blocking");
  });
});
