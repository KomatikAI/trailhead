// Gate-side autofix invocation (ADR-010). Bridges the Action's evaluation to the
// shared git-write executor: from the remediation fixes, fetch the current
// content of the files an eligible fix touches, then run the executor against a
// GithubGitWriter on the PR's HEAD branch.
//
// Safety: opt-in (`enabled` defaults the executor to dry-run when false), fork-
// guarded (can't write to a fork's branch), and the caller wraps it fail-soft so
// autofix never blocks the gate.

import type { RemediationFix } from "./types.js";
import type { SubmissionFileInfo } from "./submission-checks/types.js";
import { GithubGitWriter, type GitRestClient } from "./github-git-writer.js";
import { executeAutofixRound, type AutofixExecuteResult } from "./autofix-executor.js";
import { DEFAULT_AUTOFIX_BUILDERS } from "./autofix-builders.js";

/** Octokit subset this needs: git-data writes (via GithubGitWriter) + getContent. */
export interface GateAutofixClient extends GitRestClient {
  rest: GitRestClient["rest"] & {
    repos: {
      getContent(p: {
        owner: string;
        repo: string;
        path: string;
        ref?: string;
      }): Promise<{ data: unknown }>;
    };
  };
}

export interface RunGateAutofixOptions {
  client: GateAutofixClient;
  fixes: RemediationFix[];
  owner: string;
  repo: string;
  evaluationId: string;
  /** PR head branch — the autofix commit target. */
  headBranch?: string;
  /** Fork detection: skip when the PR head is a different repo. */
  headRepoFullName?: string;
  baseRepoFullName?: string;
  /** When false, the executor only plans (dry-run) — no commit. Default false. */
  enabled?: boolean;
  trustAutofixEnabled?: boolean;
  catalogKnownEntities?: Set<string>;
}

function skip(evaluationId: string, reason: string): AutofixExecuteResult {
  return { committed: false, evaluationId, skippedReason: reason };
}

async function readContent(
  client: GateAutofixClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  try {
    const res = await client.rest.repos.getContent({ owner, repo, path, ref });
    const data = res.data as { content?: string; encoding?: string } | undefined;
    if (data && typeof data.content === "string") {
      const encoding = (data.encoding as BufferEncoding) || "base64";
      return Buffer.from(data.content, encoding).toString("utf8");
    }
    return null;
  } catch {
    return null;
  }
}

export async function runGateAutofix(
  opts: RunGateAutofixOptions,
): Promise<AutofixExecuteResult> {
  if (!opts.headBranch) return skip(opts.evaluationId, "No PR head branch");
  if (
    opts.headRepoFullName &&
    opts.baseRepoFullName &&
    opts.headRepoFullName !== opts.baseRepoFullName
  ) {
    return skip(opts.evaluationId, "Fork PR — cannot write to head branch");
  }

  // Nothing to do unless something is autofix-eligible.
  const eligible = opts.fixes.filter((f) => f.autofix_eligible);
  if (eligible.length === 0) {
    return skip(opts.evaluationId, "No autofix-eligible fixes in remediation payload");
  }

  // Fetch current content for the files those fixes touch (HEAD branch).
  const paths = [...new Set(eligible.flatMap((f) => f.files))].filter(Boolean);
  const files: SubmissionFileInfo[] = [];
  for (const path of paths) {
    const content = await readContent(
      opts.client,
      opts.owner,
      opts.repo,
      path,
      opts.headBranch,
    );
    files.push({ filename: path, content: content ?? "" });
  }

  const writer = new GithubGitWriter(opts.client, opts.owner, opts.repo);
  return executeAutofixRound({
    fixes: opts.fixes,
    files,
    builders: DEFAULT_AUTOFIX_BUILDERS,
    writer,
    branch: opts.headBranch,
    evaluationId: opts.evaluationId,
    trustAutofixEnabled: opts.trustAutofixEnabled,
    dryRun: opts.enabled !== true,
    buildContext: { catalogKnownEntities: opts.catalogKnownEntities },
  });
}
