import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
/** Job outcome as emitted by path-filtered workflows (E15). */
export const CiManifestJobOutcome = z.enum([
    "ran",
    "passed",
    "skipped",
    "failed",
    "pending",
    "cancelled",
]);
/** Why a job did not run — `paths-filter` is the primary v4.2 use case. */
export const CiManifestSkipReason = z.enum([
    "paths-filter",
    "paths-ignore",
    "manual",
    "condition",
    "concurrency",
    "workflow_dispatch",
    "other",
]);
export const CiManifestJob = z.object({
    name: z.string().min(1),
    outcome: CiManifestJobOutcome,
    reason: CiManifestSkipReason.optional(),
    check_run_id: z.number().int().positive().optional(),
    details_url: z.string().url().optional(),
});
export const CiManifest = z.object({
    schema_version: z.literal(1),
    generated_at: z.string().optional(),
    commit_sha: z.string().optional(),
    workflow: z.string().optional(),
    run_id: z.number().int().positive().optional(),
    jobs: z.array(CiManifestJob),
});
export function parseCiManifest(raw) {
    return CiManifest.parse(raw);
}
export function readCiManifestFile(filePath) {
    try {
        const resolved = path.resolve(filePath);
        const contents = fs.readFileSync(resolved, "utf8");
        return parseCiManifest(JSON.parse(contents));
    }
    catch {
        return null;
    }
}
