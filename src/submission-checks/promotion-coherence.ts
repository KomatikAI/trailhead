// Promotion Coherence detector (ADR-010) — guard env-branch promotions.
//
// Incident #5: work landed on `dev` behind an in-flight promotion, so the open
// production release silently shipped without it — and a destructive migration
// rode a staging→prod release to production. Ordinary detectors look at the diff;
// this one looks at the *branch topology* of a promotion PR (base/head from
// GITHUB_BASE_REF / GITHUB_HEAD_REF, threaded via ctx.promotion).
//
// v1 catches two in-reach signals on a promotion PR (env branch → env branch):
//   1. Stage skip — a promotion straight into a production branch from `dev`
//      (bypassing staging). The ladder is dev → staging → master/main.
//   2. Risky payload to prod — a promotion into production that carries SQL
//      migrations: confirm they belong in THIS release and carry destructive
//      evidence (see `destructive_change`).
// Ships `warn` (phase-0). Follow-up: "source has commits not in this PR" (omitted
// work) needs an octokit branch-compare, beyond the file-diff model — tracked.

import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext } from "./types.js";
import { normalizePath } from "./helpers.js";

const DEV_BRANCHES = new Set(["dev", "develop", "development"]);
const PREPROD_BRANCHES = new Set(["staging", "stage", "preprod", "pre-prod", "release"]);
const PROD_BRANCHES = new Set(["master", "main", "production", "prod"]);
const ENV_BRANCHES = new Set([...DEV_BRANCHES, ...PREPROD_BRANCHES, ...PROD_BRANCHES]);

/** Strip refs/heads/ and any owner prefix; lower-case the bare branch name. */
function bareBranch(ref: string | undefined): string {
  if (!ref) return "";
  let b = ref.trim();
  b = b.replace(/^refs\/heads\//, "");
  const slash = b.lastIndexOf(":");
  if (slash >= 0) b = b.slice(slash + 1);
  return b.toLowerCase();
}

function isMigration(path: string): boolean {
  return /\.sql$/i.test(path);
}

export function detectPromotionCoherence(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const base = bareBranch(ctx.promotion?.baseBranch);
  const head = bareBranch(ctx.promotion?.headBranch);
  // Dormant unless we actually have a promotion (env branch → env branch).
  if (!base || !head) return null;
  if (!ENV_BRANCHES.has(base) || !ENV_BRANCHES.has(head)) return null;

  const findings: string[] = [];

  // 1. Stage skip into production.
  if (PROD_BRANCHES.has(base) && DEV_BRANCHES.has(head)) {
    findings.push(
      `promotes ${head} → ${base}, skipping the pre-prod stage (ladder: dev → staging → ${base})`,
    );
  }

  // 2. Migrations entering production via a promotion.
  const migrations = ctx.files.map((f) => normalizePath(f.filename)).filter(isMigration);
  if (PROD_BRANCHES.has(base) && migrations.length > 0) {
    findings.push(
      `carries ${migrations.length} migration(s) into production (${migrations
        .slice(0, 5)
        .join(
          ", ",
        )}) — confirm they belong in this release and carry destructive_change evidence`,
    );
  }

  if (findings.length === 0) return null;

  return {
    code: "promotion_coherence",
    severity: "warn",
    title: "Promotion coherence",
    detail: `This promotion ${findings.join("; ")}.`,
    files: migrations,
    suggested_action:
      "Promote through the full ladder (dev → staging → master/main), and double-check " +
      "the release contents (especially destructive migrations) match what you intend to ship.",
    autofix_eligible: false,
  };
}
