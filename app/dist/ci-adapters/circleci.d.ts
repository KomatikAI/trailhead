import type { CiManifestJobOutcome } from "../ci-manifest.js";
import { type CiManifest, type CiManifestJob } from "../ci-manifest.js";
export interface CircleCiAdapterOptions {
    token: string;
    projectSlug: string;
    commitSha: string;
    apiUrl?: string;
}
interface CircleCiJob {
    name: string;
    status: string;
    job_number?: number;
    web_url?: string;
}
export declare function mapCircleCiJobStatus(status: string): CiManifestJobOutcome;
export declare function circleCiJobsToManifestJobs(jobs: CircleCiJob[]): CiManifestJob[];
export declare function fetchCircleCiManifest(options: CircleCiAdapterOptions): Promise<CiManifest | null>;
export {};
