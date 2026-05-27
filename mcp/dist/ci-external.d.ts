import { z } from "zod";
import { type CiManifest as CiManifestType } from "./ci-manifest.js";
export declare const CiExternalSource: z.ZodEnum<["generic", "gitlab", "circleci", "webhook"]>;
export type CiExternalSource = z.infer<typeof CiExternalSource>;
/** Webhook payload for non-GitHub CI status (E17.3). Jobs reuse ci-manifest job shape. */
export declare const CiExternalWebhook: z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    commit_sha: z.ZodString;
    repo: z.ZodOptional<z.ZodString>;
    source: z.ZodDefault<z.ZodEnum<["generic", "gitlab", "circleci", "webhook"]>>;
    generated_at: z.ZodOptional<z.ZodString>;
    workflow: z.ZodOptional<z.ZodString>;
    run_id: z.ZodOptional<z.ZodNumber>;
    jobs: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        outcome: z.ZodEnum<["ran", "passed", "skipped", "failed", "pending", "cancelled"]>;
        reason: z.ZodOptional<z.ZodEnum<["paths-filter", "paths-ignore", "manual", "condition", "concurrency", "workflow_dispatch", "other"]>>;
        check_run_id: z.ZodOptional<z.ZodNumber>;
        details_url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        outcome: "ran" | "passed" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }, {
        name: string;
        outcome: "ran" | "passed" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: 1;
    commit_sha: string;
    jobs: {
        name: string;
        outcome: "ran" | "passed" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }[];
    source: "generic" | "gitlab" | "circleci" | "webhook";
    generated_at?: string | undefined;
    workflow?: string | undefined;
    run_id?: number | undefined;
    repo?: string | undefined;
}, {
    schema_version: 1;
    commit_sha: string;
    jobs: {
        name: string;
        outcome: "ran" | "passed" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }[];
    generated_at?: string | undefined;
    workflow?: string | undefined;
    run_id?: number | undefined;
    source?: "generic" | "gitlab" | "circleci" | "webhook" | undefined;
    repo?: string | undefined;
}>;
export type CiExternalWebhook = z.infer<typeof CiExternalWebhook>;
export declare function parseCiExternalWebhook(raw: unknown): CiExternalWebhook;
export declare function externalStatusToManifest(payload: CiExternalWebhook): CiManifestType;
export declare function mergeCiManifests(...manifests: Array<CiManifestType | null | undefined>): CiManifestType | null;
export interface FetchCiExternalStatusOptions {
    secret?: string;
    commitSha?: string;
}
export declare function fetchCiExternalStatus(url: string, options?: FetchCiExternalStatusOptions): Promise<CiManifestType | null>;
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
export declare function resolveCiManifests(options: ResolveCiManifestsOptions): Promise<CiManifestType | null>;
