import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Job outcome as emitted by path-filtered workflows (E15). */
export const CiManifestJobOutcome = z.enum([
  "ran",
  "skipped",
  "failed",
  "pending",
  "cancelled",
]);
export type CiManifestJobOutcome = z.infer<typeof CiManifestJobOutcome>;

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
export type CiManifestSkipReason = z.infer<typeof CiManifestSkipReason>;

export const CiManifestJob = z.object({
  name: z.string().min(1),
  outcome: CiManifestJobOutcome,
  reason: CiManifestSkipReason.optional(),
  check_run_id: z.number().int().positive().optional(),
  details_url: z.string().url().optional(),
});
export type CiManifestJob = z.infer<typeof CiManifestJob>;

export const CiManifest = z.object({
  schema_version: z.literal(1),
  generated_at: z.string().optional(),
  commit_sha: z.string().optional(),
  workflow: z.string().optional(),
  run_id: z.number().int().positive().optional(),
  jobs: z.array(CiManifestJob),
});
export type CiManifest = z.infer<typeof CiManifest>;

export function parseCiManifest(raw: unknown): CiManifest {
  return CiManifest.parse(raw);
}

export function readCiManifestFile(filePath: string): CiManifest | null {
  try {
    const resolved = path.resolve(filePath);
    const contents = fs.readFileSync(resolved, "utf8");
    return parseCiManifest(JSON.parse(contents));
  } catch {
    return null;
  }
}
