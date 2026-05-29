import { describe, expect, it } from "vitest";
import { buildAutofixPlan, isRedLanePath, selectAutofixCommit } from "../fixer-core.js";
import type { RemediationFix } from "../types.js";

describe("fixer-core", () => {
  it("blocks autofix on migration paths", () => {
    expect(isRedLanePath("supabase/migrations/20260101_x.sql")).toBe(true);
    expect(isRedLanePath("src/utils/format.ts")).toBe(false);
  });

  it("selects first allowlisted autofix", () => {
    const fixes: RemediationFix[] = [
      {
        code: "submission.context_freshness",
        severity: "warn",
        title: "Stale name",
        detail: "DeployGuard",
        files: ["README.md"],
        autofix_eligible: true,
        autofix_class: "doc-update",
      },
      {
        code: "risk.test_coverage",
        severity: "warn",
        title: "Missing tests",
        detail: "Add tests",
        files: ["supabase/migrations/x.sql"],
        autofix_eligible: true,
        autofix_class: "test-scaffold",
      },
    ];
    const plan = buildAutofixPlan(fixes);
    expect(plan.blocked).toHaveLength(1);
    const selected = selectAutofixCommit(plan);
    expect(selected?.autofix_class).toBe("doc-update");
  });
});
