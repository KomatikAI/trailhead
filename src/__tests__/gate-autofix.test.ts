import { describe, expect, it, vi } from "vitest";
import { runGateAutofix, type GateAutofixClient } from "../gate-autofix.js";
import { detectContractIntegrity } from "../submission-checks/contract-integrity.js";
import { deriveSubmissionFixes } from "../submission-remediation.js";
import type {
  SubmissionCheckContext,
  SubmissionFileInfo,
} from "../submission-checks/types.js";

const MISSING_LOCAL = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace-drift
spec:
  type: library
  owner: komatik
  system: trace
`;

function ctx(files: SubmissionFileInfo[]): SubmissionCheckContext {
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
  };
}

function contractFixes() {
  const check = detectContractIntegrity(
    ctx([{ filename: "catalog-info.yaml", content: MISSING_LOCAL, status: "modified" }]),
  )!;
  return deriveSubmissionFixes([check]);
}

function mockClient(): GateAutofixClient {
  return {
    rest: {
      repos: {
        getContent: vi.fn(async () => ({
          data: {
            content: Buffer.from(MISSING_LOCAL, "utf8").toString("base64"),
            encoding: "base64",
          },
        })),
      },
      git: {
        getRef: vi.fn(async () => ({ data: { object: { sha: "base-sha" } } })),
        getCommit: vi.fn(async () => ({ data: { tree: { sha: "base-tree" } } })),
        createBlob: vi.fn(async () => ({ data: { sha: "blob-sha" } })),
        createTree: vi.fn(async () => ({ data: { sha: "new-tree" } })),
        createCommit: vi.fn(async () => ({ data: { sha: "new-commit" } })),
        updateRef: vi.fn(async () => ({})),
      },
    },
  };
}

const baseOpts = {
  owner: "KomatikAI",
  repo: "trace",
  evaluationId: "eval-1",
  headBranch: "feat/x",
  headRepoFullName: "KomatikAI/trace",
  baseRepoFullName: "KomatikAI/trace",
};

describe("runGateAutofix (ADR-010 App/Action invocation)", () => {
  it("commits when enabled: fetches content, builds the stub, writes one commit", async () => {
    const client = mockClient();
    const res = await runGateAutofix({
      ...baseOpts,
      client,
      fixes: contractFixes(),
      enabled: true,
    });
    expect(res.committed).toBe(true);
    expect(res.commitSha).toBe("new-commit");
    expect(client.rest.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ path: "catalog-info.yaml", ref: "feat/x" }),
    );
    expect(client.rest.git.createCommit).toHaveBeenCalledTimes(1);
    expect(client.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/feat/x", sha: "new-commit" }),
    );
  });

  it("dry-run by default (enabled omitted): plans edits, writes nothing", async () => {
    const client = mockClient();
    const res = await runGateAutofix({ ...baseOpts, client, fixes: contractFixes() });
    expect(res.committed).toBe(false);
    expect(res.edits?.length).toBeGreaterThan(0);
    expect(client.rest.git.createCommit).not.toHaveBeenCalled();
    expect(client.rest.git.updateRef).not.toHaveBeenCalled();
  });

  it("skips fork PRs (head repo differs from base)", async () => {
    const client = mockClient();
    const res = await runGateAutofix({
      ...baseOpts,
      client,
      fixes: contractFixes(),
      enabled: true,
      headRepoFullName: "someone-else/trace",
    });
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain("Fork");
    expect(client.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it("skips when there is no head branch", async () => {
    const client = mockClient();
    const res = await runGateAutofix({
      ...baseOpts,
      client,
      fixes: contractFixes(),
      enabled: true,
      headBranch: undefined,
    });
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain("head branch");
  });

  it("skips when no fixes are autofix-eligible", async () => {
    const client = mockClient();
    const res = await runGateAutofix({
      ...baseOpts,
      client,
      fixes: [],
      enabled: true,
    });
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain("No autofix-eligible");
    expect(client.rest.repos.getContent).not.toHaveBeenCalled();
  });
});
