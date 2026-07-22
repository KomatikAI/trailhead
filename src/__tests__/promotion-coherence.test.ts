import { describe, expect, it } from "vitest";
import { detectPromotionCoherence } from "../submission-checks/promotion-coherence.js";
import type {
  SubmissionCheckContext,
  SubmissionFileInfo,
} from "../submission-checks/types.js";

function ctx(
  promotion: { baseBranch?: string; headBranch?: string } | undefined,
  files: SubmissionFileInfo[] = [],
): SubmissionCheckContext {
  return {
    files,
    prPaths: new Set(files.map((f) => f.filename)),
    komatikInstance: false,
    staleTerms: [],
    namingAllowlist: {},
    authRouteAllowlist: [],
    authRouteHelpers: [],
    retiredRouteAllowlist: [],
    maxFileLines: 1000,
    declaredPackages: new Set(),
    pathIgnorePatterns: [],
    renamePatterns: [],
    slugOnlyPatterns: [],
    detectorPolicy: {},
    promotion,
  };
}

const migration = (name: string): SubmissionFileInfo => ({
  filename: name,
  content: "DELETE FROM t WHERE id = 1;",
  status: "added",
});

describe("promotion_coherence (ADR-010)", () => {
  it("is dormant without promotion context (local / non-PR run)", () => {
    expect(detectPromotionCoherence(ctx(undefined))).toBeNull();
  });

  it("is dormant for a normal feature → dev PR", () => {
    expect(
      detectPromotionCoherence(ctx({ baseBranch: "dev", headBranch: "feat/x" })),
    ).toBeNull();
  });

  it("warns on a stage skip (dev → master)", () => {
    const res = detectPromotionCoherence(
      ctx({ baseBranch: "master", headBranch: "dev" }),
    );
    expect(res).not.toBeNull();
    expect(res!.code).toBe("promotion_coherence");
    expect(res!.severity).toBe("warn");
    expect(res!.detail).toContain("skipping the pre-prod stage");
  });

  it("warns when a migration rides a promotion into production (cognitive-debt class)", () => {
    const res = detectPromotionCoherence(
      ctx({ baseBranch: "master", headBranch: "staging" }, [
        migration("supabase/migrations/0050_retire.sql"),
      ]),
    );
    expect(res).not.toBeNull();
    expect(res!.detail).toContain("migration(s) into production");
    expect(res!.detail).toContain("0050_retire.sql");
  });

  it("is quiet on a clean staging → master promotion with no migrations", () => {
    expect(
      detectPromotionCoherence(ctx({ baseBranch: "master", headBranch: "staging" })),
    ).toBeNull();
  });

  it("normalizes refs/heads/ prefixes", () => {
    const res = detectPromotionCoherence(
      ctx({ baseBranch: "refs/heads/main", headBranch: "refs/heads/dev" }),
    );
    expect(res).not.toBeNull();
    expect(res!.detail).toContain("dev → main");
  });
});
