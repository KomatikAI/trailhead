#!/usr/bin/env node
/** Read-only soak report. False positives require human classifications. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function evaluateSoak(
  rows,
  reviews = [],
  {
    minPrs = 30,
    threshold = 0.1,
    since = "2026-06-06T00:00:00Z",
    repo = "KomatikAI/agents",
    now = Date.now(),
  } = {},
) {
  if (
    !Number.isInteger(minPrs) ||
    minPrs < 30 ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 0.1 ||
    !Number.isFinite(Date.parse(since)) ||
    Date.parse(since) < Date.parse("2026-06-06T00:00:00Z")
  )
    throw new Error(
      "Soak options must preserve the post-baseline 30-PR / <10% requirement",
    );
  if (!Array.isArray(rows) || !Array.isArray(reviews))
    throw new Error("Evaluations and reviews must be arrays");
  const latest = new Map();
  for (const row of rows) {
    const time = Date.parse(row.created_at);
    if (
      row.repo_id !== repo ||
      !Number.isInteger(row.pr_number) ||
      row.pr_number <= 0 ||
      !Number.isFinite(time) ||
      time < Date.parse(since) ||
      time > now
    )
      continue;
    if (
      !latest.has(row.pr_number) ||
      time > Date.parse(latest.get(row.pr_number).created_at)
    )
      latest.set(row.pr_number, row);
  }
  let qualified = 0;
  let falsePositives = 0;
  let findings = 0;
  const unresolved = [];
  for (const row of latest.values()) {
    const checks = row.submission_checks;
    const valid =
      Array.isArray(checks) &&
      checks.every(
        (c) =>
          c &&
          typeof c.code === "string" &&
          ["blocking", "warn", "advisory"].includes(c.severity),
      );
    if (!valid || !/^[a-f0-9]{40}$/i.test(row.commit_sha ?? "")) {
      unresolved.push({
        pr: row.pr_number,
        reason: "missing current submission schema or full commit SHA",
      });
      continue;
    }
    const hasFinding = checks.some((c) => c.severity !== "advisory");
    if (hasFinding) findings++;
    // Bind review to the exact evaluation, not just the PR number or commit:
    // re-evaluation can change the detector output without changing the head.
    const matches = reviews.filter(
      (r) =>
        r.repo_id === repo &&
        r.pr_number === row.pr_number &&
        r.commit_sha === row.commit_sha &&
        r.evaluated_at === row.created_at,
    );
    const review = matches.length === 1 ? matches[0] : null;
    const reviewedAt = Date.parse(review?.reviewed_at);
    const classificationMatches = hasFinding
      ? ["true_positive", "false_positive"].includes(review?.classification)
      : review?.classification === "clean";
    if (
      !review ||
      !classificationMatches ||
      typeof review.reviewer !== "string" ||
      !review.reviewer.trim() ||
      !/^https:\/\//.test(review.evidence_url ?? "") ||
      !Number.isFinite(reviewedAt) ||
      reviewedAt < Date.parse(row.created_at) ||
      reviewedAt > now
    ) {
      unresolved.push({
        pr: row.pr_number,
        reason:
          "needs one matching human classification with reviewer, timestamp and evidence URL",
      });
      continue;
    }
    qualified++;
    if (review.classification === "false_positive") falsePositives++;
  }
  const fpRate = qualified ? falsePositives / qualified : null;
  return {
    repo,
    since,
    distinctPrs: latest.size,
    qualified,
    findings,
    falsePositives,
    fpRate,
    unresolved,
    ready: qualified >= minPrs && unresolved.length === 0 && fpRate < threshold,
  };
}

async function main() {
  const secret = process.env.INTERNAL_API_SECRET || process.env.EVALUATION_STORE_SECRET;
  if (!secret) throw new Error("Set INTERNAL_API_SECRET or EVALUATION_STORE_SECRET");
  const url = new URL(
    process.env.STORE_URL || "https://komatik.ai/api/trailhead/evaluations",
  );
  if (url.protocol !== "https:")
    throw new Error("The authenticated store endpoint must use HTTPS");
  const repo = process.env.SOAK_REPO || "KomatikAI/agents";
  url.searchParams.set("repo_id", repo);
  url.searchParams.set("limit", "200");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Store GET failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.evaluations))
    throw new Error("Store response has no evaluations array");
  const reviews = process.env.SOAK_REVIEW_FILE
    ? JSON.parse(readFileSync(process.env.SOAK_REVIEW_FILE, "utf8"))
    : [];
  const report = evaluateSoak(body.evaluations, reviews, {
    repo,
    minPrs: Number(process.env.SOAK_MIN_PRS || 30),
    threshold: Number(process.env.SOAK_FP_THRESHOLD || 0.1),
    since: process.env.SOAK_SINCE || "2026-06-06T00:00:00Z",
  });
  // A full page can cut off the review window; never call a truncated sample ready.
  if (body.evaluations.length >= 200 || body.has_more || body.next_cursor) {
    report.ready = false;
    report.unresolved.push({
      reason:
        "store result may be truncated; supply a complete bounded review window before flipping",
    });
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(`Flip-ready: ${report.ready ? "YES" : "NO"}`);
  process.exitCode = report.ready ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
