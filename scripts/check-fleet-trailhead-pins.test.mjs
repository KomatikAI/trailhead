import { strict as assert } from "node:assert";
import { test } from "node:test";
import { auditFleet, workflowPins } from "./check-fleet-trailhead-pins.mjs";

const sha = "9fe8e8ad089d258f83f030a260ae06123e32d66f";
function fixture({
  ref = sha,
  denied = false,
  archived = false,
  malformed = false,
} = {}) {
  return (path) => {
    if (path.endsWith("/commits/v4.8.0")) return { sha };
    if (path === "repos/KomatikAI/consumer")
      return { default_branch: "release/current", archived };
    if (path === "repos/KomatikAI/consumer/commits/release%2Fcurrent") return { sha };
    assert.ok(path.endsWith(`?ref=${sha}`));
    if (path.includes("contents/.github/workflows?"))
      return [
        {
          name: "custom-gate.yaml",
          path: ".github/workflows/custom-gate.yaml",
          type: "file",
        },
      ];
    if (denied) throw new Error("HTTP 403");
    const content = malformed
      ? "jobs: [broken"
      : `jobs:\n  gate:\n    steps:\n      - uses: KomatikAI/trailhead@${ref}\n`;
    return { encoding: "base64", content: Buffer.from(content).toString("base64") };
  };
}

test("accepts the actual immutable release commit in an arbitrarily named workflow", () => {
  const result = auditFleet({ api: fixture(), repos: ["consumer"] });
  assert.equal(result.failing, 0);
  assert.equal(result.expectedSha, sha);
  assert.equal(result.results[0].commit_sha, sha);
  assert.equal(result.results[0].pins[0].workflow, ".github/workflows/custom-gate.yaml");
});
test("supports exact release tags for existing consumers", () => {
  assert.equal(
    auditFleet({ api: fixture({ ref: "v4.8.0" }), repos: ["consumer"] }).failing,
    0,
  );
});
test("rejects floating, outdated, unrelated and abbreviated commits", () => {
  for (const ref of ["v4", "v4.5.7", "dev", "a".repeat(40), sha.slice(0, 7)]) {
    assert.equal(
      auditFleet({ api: fixture({ ref }), repos: ["consumer"] }).failing,
      1,
      ref,
    );
  }
});
test("does not count commented examples or run commands as installed actions", () => {
  assert.deepEqual(
    workflowPins(
      `jobs:\n  gate:\n    steps:\n      # uses: KomatikAI/trailhead@v4.8.0\n      - run: 'echo uses: KomatikAI/trailhead@v4.8.0'\n`,
      "ci.yml",
    ),
    [],
  );
});
test("unreadable or malformed workflow evidence cannot produce a passing audit", () => {
  for (const opts of [{ denied: true }, { malformed: true }]) {
    const report = auditFleet({ api: fixture(opts), repos: ["consumer"] });
    assert.equal(report.failing, 1);
    assert.match(report.results[0].issues.join(" "), /could not inspect workflow/);
  }
});
test("an inaccessible repository remains in the report as a failure", () => {
  const report = auditFleet({
    api: (path) =>
      path.includes("/commits/")
        ? { sha }
        : (() => {
            throw new Error("HTTP 404");
          })(),
    repos: ["private"],
  });
  assert.equal(report.failing, 1);
  assert.match(report.results[0].issues[0], /audit unavailable/);
});
test("skips archived repositories explicitly", () => {
  const report = auditFleet({ api: fixture({ archived: true }), repos: ["consumer"] });
  assert.equal(report.failing, 0);
  assert.equal(report.results[0].archived, true);
});
test("refuses an unresolved release or non-version expectation", () => {
  assert.throws(() => auditFleet({ api: () => ({ sha: "bad" }) }), /full commit SHA/);
  assert.throws(() => auditFleet({ version: "main" }), /exact major.minor.patch/);
});
