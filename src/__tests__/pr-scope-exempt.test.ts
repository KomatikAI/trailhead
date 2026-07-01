import { describe, expect, it } from "vitest";
import { detectPrScopeRisk } from "../gate.js";
import type { RepoConfig } from "../types.js";

// 89 files / ~4262 changes — the shape of a real promotion PR (komatik #2743)
// that structurally exceeds any sane max_files/max_changes.
const bigPr = Array.from({ length: 89 }, (_, i) => ({
  filename: `src/file-${i}.ts`,
  changes: 48,
  additions: 24,
  deletions: 24,
  status: "modified",
}));

function repoConfig(exempt: Array<{ head_branch?: string[]; base_branch?: string[] }>) {
  return {
    policies: {
      pr_scope: {
        enabled: true,
        max_files: 50,
        max_changes: 2000,
        mode: "block",
        require_plan_for_agent_prs: false,
        exempt: exempt.map((e) => ({
          head_branch: e.head_branch ?? [],
          base_branch: e.base_branch ?? [],
        })),
      },
    },
  } as unknown as RepoConfig;
}

describe("pr_scope branch exemptions", () => {
  it("blocks an oversized PR with no exempt rules", async () => {
    const result = await detectPrScopeRisk({
      files: bigPr as never,
      repoConfig: repoConfig([]),
      provenance: null,
      headRef: "feature/huge",
      baseRef: "dev",
    });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.factor?.type).toBe("pr_scope");
  });

  it("exempts a promotion PR matching a head/base pair", async () => {
    const result = await detectPrScopeRisk({
      files: bigPr as never,
      repoConfig: repoConfig([{ head_branch: ["dev"], base_branch: ["staging"] }]),
      provenance: null,
      headRef: "dev",
      baseRef: "staging",
    });
    expect(result.findings).toEqual([]);
    expect(result.factor).toBeNull();
    expect(result.forceBlock).toBe(false);
  });

  it("does not exempt when only one side of the pair matches", async () => {
    const result = await detectPrScopeRisk({
      files: bigPr as never,
      repoConfig: repoConfig([{ head_branch: ["dev"], base_branch: ["staging"] }]),
      provenance: null,
      headRef: "dev",
      baseRef: "master",
    });
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("treats an empty pattern list as wildcard (contexts[].match semantics)", async () => {
    const result = await detectPrScopeRisk({
      files: bigPr as never,
      repoConfig: repoConfig([{ base_branch: ["master"] }]),
      provenance: null,
      headRef: "staging",
      baseRef: "master",
    });
    expect(result.findings).toEqual([]);
  });

  it("does not exempt when branch refs are unavailable", async () => {
    const result = await detectPrScopeRisk({
      files: bigPr as never,
      repoConfig: repoConfig([{ head_branch: ["dev"], base_branch: ["staging"] }]),
      provenance: null,
    });
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
