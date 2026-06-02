// GitHub implementation of GitWriter (ADR-010). Commits a set of file edits as
// ONE atomic commit via the git-data API (blobs → tree → commit → update ref).
//
// The client is typed structurally (the subset of octokit.rest.git this needs),
// so an @actions/github `getOctokit(...)` instance satisfies it without this
// module taking a hard dependency — and a unit test can pass a mock.

import type { FileEdit, GitWriter } from "./autofix-executor.js";

type GitTreeMode = "100644" | "100755" | "040000" | "160000" | "120000";

export interface GitRestClient {
  rest: {
    git: {
      getRef(p: { owner: string; repo: string; ref: string }): Promise<{
        data: { object: { sha: string } };
      }>;
      getCommit(p: { owner: string; repo: string; commit_sha: string }): Promise<{
        data: { tree: { sha: string } };
      }>;
      createBlob(p: {
        owner: string;
        repo: string;
        content: string;
        encoding: string;
      }): Promise<{ data: { sha: string } }>;
      createTree(p: {
        owner: string;
        repo: string;
        base_tree: string;
        tree: Array<{ path: string; mode: GitTreeMode; type: "blob"; sha: string }>;
      }): Promise<{ data: { sha: string } }>;
      createCommit(p: {
        owner: string;
        repo: string;
        message: string;
        tree: string;
        parents: string[];
      }): Promise<{ data: { sha: string } }>;
      updateRef(p: {
        owner: string;
        repo: string;
        ref: string;
        sha: string;
        force?: boolean;
      }): Promise<unknown>;
    };
  };
}

export class GithubGitWriter implements GitWriter {
  constructor(
    private readonly client: GitRestClient,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async commitFiles(args: {
    branch: string;
    message: string;
    edits: FileEdit[];
  }): Promise<{ commitSha: string }> {
    const { owner, repo } = this;
    const git = this.client.rest.git;
    const ref = `heads/${args.branch}`;

    // 1. Resolve the branch head + its base tree.
    const head = await git.getRef({ owner, repo, ref });
    const baseSha = head.data.object.sha;
    const baseCommit = await git.getCommit({ owner, repo, commit_sha: baseSha });
    const baseTree = baseCommit.data.tree.sha;

    // 2. Blob each edited file, assemble a new tree on top of the base.
    const tree: Array<{ path: string; mode: GitTreeMode; type: "blob"; sha: string }> =
      [];
    for (const edit of args.edits) {
      const blob = await git.createBlob({
        owner,
        repo,
        content: edit.content,
        encoding: "utf-8",
      });
      tree.push({ path: edit.path, mode: "100644", type: "blob", sha: blob.data.sha });
    }
    const newTree = await git.createTree({ owner, repo, base_tree: baseTree, tree });

    // 3. One commit on top of the head, then fast-forward the branch.
    const commit = await git.createCommit({
      owner,
      repo,
      message: args.message,
      tree: newTree.data.sha,
      parents: [baseSha],
    });
    await git.updateRef({ owner, repo, ref, sha: commit.data.sha });

    return { commitSha: commit.data.sha };
  }
}
