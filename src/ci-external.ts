import { z } from "zod";
import { fetchCircleCiManifest } from "./ci-adapters/circleci.js";
import { fetchGitLabCiManifest } from "./ci-adapters/gitlab.js";
import {
  CiManifestJob,
  parseCiManifest,
  readCiManifestFile,
  type CiManifest as CiManifestType,
} from "./ci-manifest.js";

export const CiExternalSource = z.enum(["generic", "gitlab", "circleci", "webhook"]);
export type CiExternalSource = z.infer<typeof CiExternalSource>;

/** Webhook payload for non-GitHub CI status (E17.3). Jobs reuse ci-manifest job shape. */
export const CiExternalWebhook = z.object({
  schema_version: z.literal(1),
  commit_sha: z.string().min(7),
  repo: z
    .string()
    .regex(/^[^/]+\/[^/]+$/)
    .optional(),
  source: CiExternalSource.default("generic"),
  generated_at: z.string().optional(),
  workflow: z.string().optional(),
  run_id: z.number().int().positive().optional(),
  jobs: z.array(CiManifestJob).min(1),
});
export type CiExternalWebhook = z.infer<typeof CiExternalWebhook>;

export function parseCiExternalWebhook(raw: unknown): CiExternalWebhook {
  return CiExternalWebhook.parse(raw);
}

export function externalStatusToManifest(payload: CiExternalWebhook): CiManifestType {
  return {
    schema_version: 1,
    generated_at: payload.generated_at,
    commit_sha: payload.commit_sha,
    workflow: payload.workflow ?? payload.source,
    run_id: payload.run_id,
    jobs: payload.jobs,
  };
}

export function mergeCiManifests(
  ...manifests: Array<CiManifestType | null | undefined>
): CiManifestType | null {
  const valid = manifests.filter(
    (manifest): manifest is CiManifestType =>
      manifest != null && manifest.jobs.length > 0,
  );
  if (valid.length === 0) return null;

  const jobMap = new Map<string, CiManifestJob>();
  for (const manifest of valid) {
    for (const job of manifest.jobs) {
      jobMap.set(job.name.toLowerCase(), job);
    }
  }

  return {
    schema_version: 1,
    generated_at: valid.find((manifest) => manifest.generated_at)?.generated_at,
    commit_sha: valid.find((manifest) => manifest.commit_sha)?.commit_sha,
    workflow: valid.find((manifest) => manifest.workflow)?.workflow,
    run_id: valid.find((manifest) => manifest.run_id)?.run_id,
    jobs: [...jobMap.values()],
  };
}

export interface FetchCiExternalStatusOptions {
  secret?: string;
  commitSha?: string;
}

export async function fetchCiExternalStatus(
  url: string,
  options: FetchCiExternalStatusOptions = {},
): Promise<CiManifestType | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.secret) {
    headers.Authorization = `Bearer ${options.secret}`;
  }

  let fetchUrl = url;
  if (options.commitSha) {
    if (url.includes("{sha}")) {
      fetchUrl = url.replaceAll("{sha}", options.commitSha);
    } else {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set("commit_sha", options.commitSha);
        fetchUrl = parsed.toString();
      } catch {
        fetchUrl = url;
      }
    }
  }

  try {
    const response = await fetch(fetchUrl, { headers });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    try {
      return externalStatusToManifest(parseCiExternalWebhook(raw));
    } catch {
      return parseCiManifest(raw);
    }
  } catch {
    return null;
  }
}

export interface ResolveCiManifestsOptions {
  ciManifestPath?: string;
  ciExternalStatusUrl?: string;
  ciExternalStatusSecret?: string;
  commitSha: string;
  gitlabApiUrl?: string;
  gitlabToken?: string;
  gitlabProjectId?: string;
  circleciToken?: string;
  circleciProjectSlug?: string;
}

export async function resolveCiManifests(
  options: ResolveCiManifestsOptions,
): Promise<CiManifestType | null> {
  const manifests: CiManifestType[] = [];

  if (options.ciManifestPath) {
    const fromFile = readCiManifestFile(options.ciManifestPath);
    if (fromFile) manifests.push(fromFile);
  }

  if (options.ciExternalStatusUrl) {
    const fromUrl = await fetchCiExternalStatus(options.ciExternalStatusUrl, {
      secret: options.ciExternalStatusSecret,
      commitSha: options.commitSha,
    });
    if (fromUrl) manifests.push(fromUrl);
  }

  if (options.gitlabToken && options.gitlabProjectId) {
    const fromGitLab = await fetchGitLabCiManifest({
      apiUrl: options.gitlabApiUrl ?? "https://gitlab.com/api/v4",
      token: options.gitlabToken,
      projectId: options.gitlabProjectId,
      commitSha: options.commitSha,
    });
    if (fromGitLab) manifests.push(fromGitLab);
  }

  if (options.circleciToken && options.circleciProjectSlug) {
    const fromCircleCi = await fetchCircleCiManifest({
      token: options.circleciToken,
      projectSlug: options.circleciProjectSlug,
      commitSha: options.commitSha,
    });
    if (fromCircleCi) manifests.push(fromCircleCi);
  }

  return mergeCiManifests(...manifests);
}
