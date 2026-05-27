import type { CiManifestJobOutcome } from "../ci-manifest.js";
import { type CiManifest, type CiManifestJob } from "../ci-manifest.js";

export interface CircleCiAdapterOptions {
  token: string;
  projectSlug: string;
  commitSha: string;
  apiUrl?: string;
}

interface CircleCiPipeline {
  id: string;
  vcs?: { revision?: string };
}

interface CircleCiWorkflow {
  id: string;
  name: string;
  status: string;
}

interface CircleCiJob {
  name: string;
  status: string;
  job_number?: number;
  web_url?: string;
}

interface CircleCiListResponse<T> {
  items?: T[];
}

export function mapCircleCiJobStatus(status: string): CiManifestJobOutcome {
  switch (status) {
    case "success":
      return "passed";
    case "failed":
    case "failing":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "skipped":
    case "not_run":
      return "skipped";
    case "running":
    case "queued":
    case "on_hold":
    case "blocked":
      return "pending";
    default:
      return "pending";
  }
}

export function circleCiJobsToManifestJobs(jobs: CircleCiJob[]): CiManifestJob[] {
  return jobs.map((job) => ({
    name: job.name,
    outcome: mapCircleCiJobStatus(job.status),
    details_url: job.web_url,
  }));
}

function revisionMatches(revision: string | undefined, commitSha: string): boolean {
  if (!revision) return false;
  return (
    revision === commitSha ||
    revision.startsWith(commitSha) ||
    commitSha.startsWith(revision)
  );
}

export async function fetchCircleCiManifest(
  options: CircleCiAdapterOptions,
): Promise<CiManifest | null> {
  const base = (options.apiUrl ?? "https://circleci.com/api/v2").replace(/\/$/, "");
  const slug = encodeURIComponent(options.projectSlug);
  const headers = {
    "Circle-Token": options.token,
    Accept: "application/json",
  };

  const pipelinesRes = await fetch(`${base}/project/${slug}/pipeline`, { headers });
  if (!pipelinesRes.ok) return null;

  const pipelinesBody =
    (await pipelinesRes.json()) as CircleCiListResponse<CircleCiPipeline>;
  const pipeline = pipelinesBody.items?.find((item) =>
    revisionMatches(item.vcs?.revision, options.commitSha),
  );
  if (!pipeline) return null;

  const workflowsRes = await fetch(`${base}/pipeline/${pipeline.id}/workflow`, {
    headers,
  });
  if (!workflowsRes.ok) return null;

  const workflowsBody =
    (await workflowsRes.json()) as CircleCiListResponse<CircleCiWorkflow>;
  const workflow = workflowsBody.items?.[0];
  if (!workflow) return null;

  const jobsRes = await fetch(`${base}/workflow/${workflow.id}/job`, { headers });
  if (!jobsRes.ok) return null;

  const jobsBody = (await jobsRes.json()) as CircleCiListResponse<CircleCiJob>;
  const jobs = jobsBody.items ?? [];
  if (jobs.length === 0) return null;

  return {
    schema_version: 1,
    commit_sha: options.commitSha,
    workflow: `circleci:${workflow.name}`,
    jobs: circleCiJobsToManifestJobs(jobs),
  };
}
