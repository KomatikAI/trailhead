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
  if (!/^[a-f0-9]{40}$/.test(sha)) return null;
  try {
    const origin = new URL(base);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    const pipelinesRes = await fetch(
      `${base}/projects/${projectId}/pipelines?sha=${encodeURIComponent(sha)}`,
      { headers, redirect: "error", signal: AbortSignal.timeout(10_000) },
    );
    if (!pipelinesRes.ok) return null;

    const pipelines = (await pipelinesRes.json()) as GitLabPipeline[];
    if (!Array.isArray(pipelines) || pipelines.length === 0) return null;

    const pipeline = pipelines[0];
    if (pipeline.sha !== sha || !Number.isSafeInteger(pipeline.id) || pipeline.id < 1)
      return null;
    const jobs: GitLabJob[] = [];
    let page = 1;
    for (; page <= 10; page++) {
      const jobsRes = await fetch(
        `${base}/projects/${projectId}/pipelines/${pipeline.id}/jobs?per_page=100&page=${page}`,
        { headers, redirect: "error", signal: AbortSignal.timeout(10_000) },
      );
      if (!jobsRes.ok) return null;
      const batch = (await jobsRes.json()) as GitLabJob[];
      if (!Array.isArray(batch)) return null;
      jobs.push(...batch);
      const next = jobsRes.headers.get("x-next-page");
      if (!next) break;
      if (next !== String(page + 1)) return null;
    }
    if (
      page > 10 ||
      jobs.length === 0 ||
      jobs.some(
        (job) =>
          !job ||
          typeof job.name !== "string" ||
          !job.name ||
          typeof job.status !== "string",
      )
    )
      return null;
    const uniqueJobs = new Map<string, CiManifestJob>();
    const severity = {
      passed: 0,
      skipped: 1,
      ran: 2,
      pending: 3,
      cancelled: 4,
      failed: 5,
    };
    for (const job of gitLabJobsToManifestJobs(jobs)) {
      const key = job.name.toLowerCase();
      const prior = uniqueJobs.get(key);
      if (!prior || severity[job.outcome] > severity[prior.outcome])
        uniqueJobs.set(key, job);
    }

    return {
      schema_version: 1,
      commit_sha: sha,
      workflow: `gitlab:${pipeline.id}`,
      run_id: pipeline.id,
      jobs: [...uniqueJobs.values()],
    };
  } catch {
    return null;
  }
}
