import type { CiManifestJobOutcome } from "../ci-manifest.js";
import { type CiManifest, type CiManifestJob } from "../ci-manifest.js";

export interface GitLabAdapterOptions {
  apiUrl: string;
  token: string;
  projectId: string | number;
  commitSha: string;
}

interface GitLabPipeline {
  id: number;
  sha: string;
  status: string;
  web_url?: string;
}

interface GitLabJob {
  name: string;
  status: string;
  web_url?: string;
}

export function mapGitLabJobStatus(status: string): CiManifestJobOutcome {
  switch (status) {
    case "success":
      return "passed";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    case "skipped":
      return "skipped";
    case "running":
    case "pending":
    case "waiting":
    case "preparing":
    case "created":
    case "scheduled":
      return "pending";
    default:
      return "pending";
  }
}

export function gitLabJobsToManifestJobs(jobs: GitLabJob[]): CiManifestJob[] {
  return jobs.map((job) => ({
    name: job.name,
    outcome: mapGitLabJobStatus(job.status),
    details_url: job.web_url,
  }));
}

export async function fetchGitLabCiManifest(
  options: GitLabAdapterOptions,
): Promise<CiManifest | null> {
  const base = options.apiUrl.replace(/\/$/, "");
  const projectId = encodeURIComponent(String(options.projectId));
  const sha = options.commitSha;
  const headers = { "PRIVATE-TOKEN": options.token };

  const pipelinesRes = await fetch(
    `${base}/projects/${projectId}/pipelines?sha=${encodeURIComponent(sha)}`,
    { headers },
  );
  if (!pipelinesRes.ok) return null;

  const pipelines = (await pipelinesRes.json()) as GitLabPipeline[];
  if (!Array.isArray(pipelines) || pipelines.length === 0) return null;

  const pipeline = pipelines[0];
  const jobsRes = await fetch(
    `${base}/projects/${projectId}/pipelines/${pipeline.id}/jobs`,
    { headers },
  );
  if (!jobsRes.ok) return null;

  const jobs = (await jobsRes.json()) as GitLabJob[];
  if (!Array.isArray(jobs) || jobs.length === 0) return null;

  return {
    schema_version: 1,
    commit_sha: sha,
    workflow: `gitlab:${pipeline.id}`,
    run_id: pipeline.id,
    jobs: gitLabJobsToManifestJobs(jobs),
  };
}
