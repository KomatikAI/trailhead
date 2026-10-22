import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluateSoak } from "./query-agents-submission-soak.mjs";

const rows = Array.from({ length: 30 }, (_, i) => ({
  repo_id: "KomatikAI/agents",
  pr_number: i + 1,
  commit_sha: "a".repeat(40),
  created_at: "2026-10-21T10:00:00Z",
  submission_checks: [],
}));
const reviews = rows.map((r) => ({
  repo_id: r.repo_id,
  pr_number: r.pr_number,
  commit_sha: r.commit_sha,
  evaluated_at: r.created_at,
  reviewed_at: "2026-10-21T11:00:00Z",
  classification: "clean",
  reviewer: "maintainer",
  evidence_url: `https://github.com/KomatikAI/agents/pull/${r.pr_number}`,
}));
const options = { now: Date.parse("2026-10-22T12:00:00Z") };
test("unreviewed clean arrays cannot establish a zero false-positive rate", () => {
  const result = evaluateSoak(rows, [], options);
  assert.equal(result.ready, false);
  assert.equal(result.fpRate, null);
});
test("30 reviewed post-baseline clean evaluations qualify", () => {
  assert.equal(evaluateSoak(rows, reviews, options).ready, true);
});
test("real severity findings without passed flags require classification", () => {
  const data = structuredClone(rows);
  data[0].submission_checks = [{ code: "auth_route_auth", severity: "blocking" }];
  const review = structuredClone(reviews);
  assert.equal(evaluateSoak(data, review, options).ready, false);
  review[0].classification = "false_positive";
  assert.equal(evaluateSoak(data, review, options).falsePositives, 1);
  assert.equal(evaluateSoak(data, review, options).ready, true);
});
test("a 10 percent false-positive rate does not qualify", () => {
  const data = structuredClone(rows),
    review = structuredClone(reviews);
  for (let i = 0; i < 3; i++) {
    data[i].submission_checks = [{ code: "x", severity: "warn" }];
    review[i].classification = "false_positive";
  }
  assert.equal(evaluateSoak(data, review, options).ready, false);
});
test("older, future and other-repository rows cannot inflate the sample", () => {
  for (const patch of [
    { created_at: "2026-06-01T00:00:00Z" },
    { created_at: "2030-01-01T00:00:00Z" },
    { repo_id: "Other/repo" },
  ]) {
    const data = structuredClone(rows);
    Object.assign(data[0], patch);
    assert.equal(evaluateSoak(data, reviews, options).ready, false);
  }
});
test("a newer evaluation invalidates an older classification even on the same head", () => {
  const updated = { ...rows[0], created_at: "2026-10-22T10:00:00Z" };
  assert.equal(evaluateSoak([...rows, updated], reviews, options).ready, false);
});
test("malformed checks, duplicate reviews, mismatched heads and future reviews fail closed", () => {
  assert.equal(
    evaluateSoak(
      [{ ...rows[0], submission_checks: null }, ...rows.slice(1)],
      reviews,
      options,
    ).ready,
    false,
  );
  assert.equal(evaluateSoak(rows, [...reviews, reviews[0]], options).ready, false);
  for (const patch of [
    { commit_sha: "b".repeat(40) },
    { reviewed_at: "2030-01-01T00:00:00Z" },
    { evidence_url: "" },
  ]) {
    const review = structuredClone(reviews);
    Object.assign(review[0], patch);
    assert.equal(evaluateSoak(rows, review, options).ready, false);
  }
});
test("cannot lower the documented acceptance thresholds", () => {
  assert.throws(() => evaluateSoak(rows, reviews, { minPrs: 1 }));
  assert.throws(() => evaluateSoak(rows, reviews, { threshold: 1 }));
});
