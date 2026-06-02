import { describe, expect, it, vi } from "vitest";
import {
  executeAutofixRound,
  type GitWriter,
  type FileEdit,
} from "../autofix-executor.js";
import { DEFAULT_AUTOFIX_BUILDERS } from "../autofix-builders.js";
import { GithubGitWriter, type GitRestClient } from "../github-git-writer.js";
import { detectContractIntegrity } from "../submission-checks/contract-integrity.js";
import { deriveSubmissionFixes } from "../submission-remediation.js";
import type {
  SubmissionCheckContext,
  SubmissionFileInfo,
} from "../submission-checks/types.js";

function ctx(files: SubmissionFileInfo[]): SubmissionCheckContext {
  return {
    files,
    prPaths: new Set(files.map((f) => f.filename)),
    komatikInstance: false,
    staleTerms: [],
    namingAllowlist: {},
    authRouteAllowlist: [],
    maxFileLines: 1000,
    declaredPackages: new Set(),
    pathIgnorePatterns: [],
    renamePatterns: [],
    slugOnlyPatterns: [],
    detectorPolicy: {},
  };
}

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

const files: SubmissionFileInfo[] = [
  { filename: "catalog-info.yaml", content: MISSING_LOCAL, status: "modified" },
];

function contractFixes() {
  const check = detectContractIntegrity(ctx(files))!;
  return deriveSubmissionFixes([check]);
}

function recordingWriter(): {
  writer: GitWriter;
  calls: Array<{ branch: string; edits: FileEdit[] }>;
} {
  const calls: Array<{ branch: string; edits: FileEdit[] }> = [];
  const writer: GitWriter = {
    async commitFiles(args) {
      calls.push({ branch: args.branch, edits: args.edits });
      return { commitSha: "commit-sha-123" };
    },
  };
  return { writer, calls };
}

describe("executeAutofixRound (ADR-010 git-write executor)", () => {
  it("builds edits and commits the selected fix via the writer", async () => {
    const { writer, calls } = recordingWriter();
    const res = await executeAutofixRound({
      fixes: contractFixes(),
      files,
      builders: DEFAULT_AUTOFIX_BUILDERS,
      writer,
      branch: "feat/x",
      evaluationId: "eval-1",
    });
    expect(res.committed).toBe(true);
    expect(res.commitSha).toBe("commit-sha-123");
    expect(res.fixCode).toBe("submission.contract_integrity");
    expect(res.autofixClass).toBe("doc-update");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.branch).toBe("feat/x");
    // The committed content is the original file plus the generated System stub.
    const edit = calls[0]!.edits.find((e) => e.path === "catalog-info.yaml")!;
    expect(edit.content).toContain("kind: Component"); // original
    expect(edit.content).toContain("kind: System"); // appended stub
    expect(edit.content).toContain("name: trace");
  });

  it("dry-run builds edits but does not call the writer", async () => {
    const { writer, calls } = recordingWriter();
    const res = await executeAutofixRound({
      fixes: contractFixes(),
      files,
      builders: DEFAULT_AUTOFIX_BUILDERS,
      writer,
      branch: "feat/x",
      evaluationId: "eval-1",
      dryRun: true,
    });
    expect(res.committed).toBe(false);
    expect(res.edits?.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it("skips when trust autofix is disabled", async () => {
    const { writer, calls } = recordingWriter();
    const res = await executeAutofixRound({
      fixes: contractFixes(),
      files,
      builders: DEFAULT_AUTOFIX_BUILDERS,
      writer,
      branch: "feat/x",
      evaluationId: "eval-1",
      trustAutofixEnabled: false,
    });
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain("Trust autofix disabled");
    expect(calls).toHaveLength(0);
  });

  it("skips when there are no autofix-eligible fixes", async () => {
    const { writer } = recordingWriter();
    const res = await executeAutofixRound({
      fixes: [],
      files,
      builders: DEFAULT_AUTOFIX_BUILDERS,
      writer,
      branch: "feat/x",
      evaluationId: "eval-1",
    });
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain("No autofix-eligible");
  });

  it("skips when no content builder is registered for the fix", async () => {
    const { writer, calls } = recordingWriter();
    const res = await executeAutofixRound({
      fixes: contractFixes(),
      files,
      builders: {}, // no builder for contract_integrity
      writer,
      branch: "feat/x",
      evaluationId: "eval-1",
    });
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain("No content builder");
    expect(calls).toHaveLength(0);
  });
});

describe("GithubGitWriter", () => {
  it("commits edits as one atomic commit via the git-data API", async () => {
    const client: GitRestClient = {
      rest: {
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
    const writer = new GithubGitWriter(client, "KomatikAI", "trace");
    const out = await writer.commitFiles({
      branch: "feat/x",
      message: "fix",
      edits: [{ path: "catalog-info.yaml", content: "hello" }],
    });

    expect(out.commitSha).toBe("new-commit");
    const git = client.rest.git;
    expect(git.getRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/feat/x" }),
    );
    expect(git.createBlob).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello", encoding: "utf-8" }),
    );
    expect(git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({ base_tree: "base-tree" }),
    );
    expect(git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ tree: "new-tree", parents: ["base-sha"] }),
    );
    expect(git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/feat/x", sha: "new-commit" }),
    );
  });
});
