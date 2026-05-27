import { describe, it, expect } from "vitest";
import { parseCiManifest, readCiManifestFile } from "../ci-manifest.js";
import { evaluateRequiredChecks, normalizeCheckRuns } from "../ci-core.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("parseCiManifest", () => {
  it("accepts a valid v1 manifest", () => {
    const manifest = parseCiManifest({
      schema_version: 1,
      jobs: [{ name: "Playwright", outcome: "skipped", reason: "paths-filter" }],
    });
    expect(manifest.jobs).toHaveLength(1);
    expect(manifest.jobs[0]?.reason).toBe("paths-filter");
  });

  it("rejects invalid schema version", () => {
    expect(() =>
      parseCiManifest({
        schema_version: 2,
        jobs: [],
      }),
    ).toThrow();
  });
});

describe("readCiManifestFile", () => {
  it("reads manifest from disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "th-manifest-"));
    const file = path.join(dir, "ci-manifest.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        schema_version: 1,
        jobs: [{ name: "E2E", outcome: "skipped", reason: "paths-filter" }],
      }),
    );
    const manifest = readCiManifestFile(file);
    expect(manifest?.jobs[0]?.name).toBe("E2E");
  });
});

describe("evaluateRequiredChecks with ci-manifest", () => {
  const apiChecks = normalizeCheckRuns([
    { name: "CI Gate", status: "completed", conclusion: "success" },
  ]);

  const manifest = parseCiManifest({
    schema_version: 1,
    jobs: [
      { name: "Playwright", outcome: "skipped", reason: "paths-filter" },
      { name: "Storybook", outcome: "skipped", reason: "paths-filter" },
    ],
  });

  it("treats path-filter skips as skip when check is absent from GitHub API", () => {
    const summary = evaluateRequiredChecks(
      apiChecks,
      {
        required_checks: ["CI Gate", "Playwright"],
        optional_checks: [],
        missing_required: "fail",
      },
      manifest,
    );
    expect(summary.allRequiredPassed).toBe(true);
    expect(summary.missingCount).toBe(0);
    const playwright = summary.checks.find((c) => c.name === "Playwright");
    expect(playwright?.status).toBe("skip");
    expect(playwright?.conclusion).toBe("paths-filter");
  });

  it("still fails when required check is missing and not in manifest", () => {
    const summary = evaluateRequiredChecks(
      apiChecks,
      {
        required_checks: ["Security Gate"],
        optional_checks: [],
        missing_required: "fail",
      },
      manifest,
    );
    expect(summary.allRequiredPassed).toBe(false);
    expect(summary.missingCount).toBe(1);
  });

  it("prefers manifest skip over missing policy fail", () => {
    const summary = evaluateRequiredChecks(
      [],
      {
        required_checks: ["Playwright", "Storybook"],
        optional_checks: [],
        missing_required: "fail",
      },
      manifest,
    );
    expect(summary.allRequiredPassed).toBe(true);
  });
});
