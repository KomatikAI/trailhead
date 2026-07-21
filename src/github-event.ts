export interface EvaluationTargetContext {
  sha: string;
  payload: {
    pull_request?: {
      number?: number;
      head?: { sha?: string };
    };
  };
}

/**
 * Resolve the commit and PR associated with a workflow event.
 *
 * GitHub sets `context.sha` to a synthetic merge commit for pull_request
 * workflows, while sibling check runs are attached to the PR head commit.
 * Non-PR events (including merge_group) intentionally keep context.sha.
 */
export function resolveEvaluationTarget(context: EvaluationTargetContext): {
  commitSha: string;
  prNumber?: number;
} {
  const pullRequest = context.payload.pull_request;
  return {
    commitSha: pullRequest?.head?.sha ?? context.sha,
    prNumber: pullRequest?.number,
  };
}
