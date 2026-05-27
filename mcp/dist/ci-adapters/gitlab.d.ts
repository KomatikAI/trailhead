import type { CiManifestJobOutcome } from "../ci-manifest.js";
import { type CiManifest, type CiManifestJob } from "../ci-manifest.js";
export interface GitLabAdapterOptions {
    apiUrl: string;
    token: string;
    projectId: string | number;
    commitSha: string;
}
interface GitLabJob {
    name: string;
    status: string;
    web_url?: string;
}
export declare function mapGitLabJobStatus(status: string): CiManifestJobOutcome;
export declare function gitLabJobsToManifestJobs(jobs: GitLabJob[]): CiManifestJob[];
export declare function fetchGitLabCiManifest(options: GitLabAdapterOptions): Promise<CiManifest | null>;
export {};
