#!/usr/bin/env node
/**
 * Per-PR submission-gate soak metrics for KomatikAI/agents (latest eval per PR).
 *
 * Usage:
 *   node scripts/query-agents-submission-soak.mjs
 *   STORE_URL=https://komatik.ai/api/trailhead/evaluations node scripts/query-agents-submission-soak.mjs
 *
 * Requires INTERNAL_API_SECRET or EVALUATION_STORE_SECRET in env for GET.
 */

const STORE_URL = process.env.STORE_URL || "https://komatik.ai/api/trailhead/evaluations";
const REPO = process.env.SOAK_REPO || "KomatikAI/agents";
const FP_THRESHOLD = Number(process.env.SOAK_FP_THRESHOLD || "0.10");
const MIN_PRS = Number(process.env.SOAK_MIN_PRS || "30");

async function main() {
  const secret = process.env.INTERNAL_API_SECRET || process.env.EVALUATION_STORE_SECRET;
  if (!secret) {
    console.error("Set INTERNAL_API_SECRET or EVALUATION_STORE_SECRET");
    process.exit(1);
  }

  const url = `${STORE_URL}?repo_id=${encodeURIComponent(REPO)}&limit=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`Store GET failed: HTTP ${res.status}`);
    process.exit(1);
  }

  const body = await res.json();
  const rows = body.evaluations ?? [];

  const latestByPr = new Map();
  for (const row of rows) {
    const pr = row.pr_number;
    if (!pr) continue;
    const created = String(row.created_at ?? "");
    const prev = latestByPr.get(pr);
    if (!prev || String(prev.created_at ?? "") < created) {
      latestByPr.set(pr, row);
    }
  }

  const prs = [...latestByPr.values()].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );

  let withSubmission = 0;
  let submissionFp = 0;
  let riskWarnBlock = 0;

  for (const row of prs) {
    if (row.submission_checks != null) withSubmission += 1;
    const submission = row.submission_checks;
    if (
      Array.isArray(submission) &&
      submission.some((c) => c.passed === false && c.severity !== "advisory")
    ) {
      submissionFp += 1;
    }
    if (row.gate_decision === "warn" || row.gate_decision === "block") {
      riskWarnBlock += 1;
    }
  }

  const distinctPrs = prs.length;
  const submissionFpRate = distinctPrs > 0 ? submissionFp / distinctPrs : 0;
  const riskFpRate = distinctPrs > 0 ? riskWarnBlock / distinctPrs : 0;
  const ready =
    withSubmission >= MIN_PRS &&
    distinctPrs >= MIN_PRS &&
    submissionFpRate < FP_THRESHOLD;

  console.log(`Repo: ${REPO}`);
  console.log(`Distinct PRs (latest eval each): ${distinctPrs}`);
  console.log(`Rows with submission_checks: ${withSubmission}`);
  console.log(`Submission FP-ish (failed non-advisory): ${submissionFp}`);
  console.log(`Submission FP rate: ${(submissionFpRate * 100).toFixed(1)}%`);
  console.log(`Risk warn/block rate (informational): ${(riskFpRate * 100).toFixed(1)}%`);
  console.log(
    `Flip-ready (submission FP < ${FP_THRESHOLD * 100}% over ${MIN_PRS} PRs with data): ${ready ? "YES" : "NO"}`,
  );

  if (withSubmission === 0) {
    console.log(
      "\nNote: submission_checks empty — soak cannot start until gate runs v4.5.1+ with submission-gate: true and store mapper persists analytics columns.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
