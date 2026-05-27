import { z } from "zod";
/** Job outcome as emitted by path-filtered workflows (E15). */
export declare const CiManifestJobOutcome: z.ZodEnum<["ran", "skipped", "failed", "pending", "cancelled"]>;
export type CiManifestJobOutcome = z.infer<typeof CiManifestJobOutcome>;
/** Why a job did not run — `paths-filter` is the primary v4.2 use case. */
export declare const CiManifestSkipReason: z.ZodEnum<["paths-filter", "paths-ignore", "manual", "condition", "concurrency", "workflow_dispatch", "other"]>;
export type CiManifestSkipReason = z.infer<typeof CiManifestSkipReason>;
export declare const CiManifestJob: z.ZodObject<{
    name: z.ZodString;
    outcome: z.ZodEnum<["ran", "skipped", "failed", "pending", "cancelled"]>;
    reason: z.ZodOptional<z.ZodEnum<["paths-filter", "paths-ignore", "manual", "condition", "concurrency", "workflow_dispatch", "other"]>>;
    check_run_id: z.ZodOptional<z.ZodNumber>;
    details_url: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    outcome: "ran" | "skipped" | "failed" | "pending" | "cancelled";
    reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
    check_run_id?: number | undefined;
    details_url?: string | undefined;
}, {
    name: string;
    outcome: "ran" | "skipped" | "failed" | "pending" | "cancelled";
    reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
    check_run_id?: number | undefined;
    details_url?: string | undefined;
}>;
export type CiManifestJob = z.infer<typeof CiManifestJob>;
export declare const CiManifest: z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    generated_at: z.ZodOptional<z.ZodString>;
    commit_sha: z.ZodOptional<z.ZodString>;
    workflow: z.ZodOptional<z.ZodString>;
    run_id: z.ZodOptional<z.ZodNumber>;
    jobs: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        outcome: z.ZodEnum<["ran", "skipped", "failed", "pending", "cancelled"]>;
        reason: z.ZodOptional<z.ZodEnum<["paths-filter", "paths-ignore", "manual", "condition", "concurrency", "workflow_dispatch", "other"]>>;
        check_run_id: z.ZodOptional<z.ZodNumber>;
        details_url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        outcome: "ran" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }, {
        name: string;
        outcome: "ran" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: 1;
    jobs: {
        name: string;
        outcome: "ran" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }[];
    generated_at?: string | undefined;
    commit_sha?: string | undefined;
    workflow?: string | undefined;
    run_id?: number | undefined;
}, {
    schema_version: 1;
    jobs: {
        name: string;
        outcome: "ran" | "skipped" | "failed" | "pending" | "cancelled";
        reason?: "paths-filter" | "paths-ignore" | "manual" | "condition" | "concurrency" | "workflow_dispatch" | "other" | undefined;
        check_run_id?: number | undefined;
        details_url?: string | undefined;
    }[];
    generated_at?: string | undefined;
    commit_sha?: string | undefined;
    workflow?: string | undefined;
    run_id?: number | undefined;
}>;
export type CiManifest = z.infer<typeof CiManifest>;
export declare function parseCiManifest(raw: unknown): CiManifest;
export declare function readCiManifestFile(filePath: string): CiManifest | null;
