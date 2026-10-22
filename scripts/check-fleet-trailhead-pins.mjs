#!/usr/bin/env node
/** Read-only fleet audit. Override the reviewed release with EXPECTED_VERSION. */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";

const ORG = "KomatikAI";
export const REPOS = [
  "komatik",
  "agents",
  "cairn",
  "frontier",
  "kindling",
  "pack",
  "slipstream",
  "sundog",
  "trace",
];
const ACTION =
  /^(?:KomatikAI\/(?:trailhead|deployguard)|dschirmer-shiftkey\/deployguard)@([^\s]+)$/i;
const SHA = /^[a-f0-9]{40}$/i;

export function workflowPins(content, workflow) {
  const document = load(content);
  const pins = [];
  for (const job of Object.values(document?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.uses !== "string") continue;
      const match = step.uses.match(ACTION);
      if (match) pins.push({ workflow, ref: match[1] });
    }
  }
  return pins;
}

function defaultApi(path) {
  return JSON.parse(
    execFileSync("gh", ["api", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

export function auditFleet({ api = defaultApi, version = "4.8.0", repos = REPOS } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("EXPECTED_VERSION must be an exact major.minor.patch release");
  const expected = `v${version}`;
  // The commit endpoint dereferences annotated tags as well as lightweight tags.
  const expectedSha = api(`repos/${ORG}/trailhead/commits/${expected}`).sha;
  if (!SHA.test(expectedSha ?? ""))
    throw new Error(`Cannot resolve ${expected} to a full commit SHA`);

  const results = repos.map((name) => {
    const row = { name, pins: [], issues: [] };
    try {
      const meta = api(`repos/${ORG}/${name}`);
      row.default_branch = meta.default_branch;
      if (meta.archived) return { ...row, archived: true };
      if (!meta.default_branch) throw new Error("Repository default branch unavailable");
      const head = api(
        `repos/${ORG}/${name}/commits/${encodeURIComponent(meta.default_branch)}`,
      ).sha;
      if (!SHA.test(head ?? "")) throw new Error("Default branch commit unavailable");
      row.commit_sha = head;
      const ref = head;
      const files = api(`repos/${ORG}/${name}/contents/.github/workflows?ref=${ref}`);
      if (!Array.isArray(files)) throw new Error("Workflow directory unavailable");
      for (const file of files.filter(
        (f) => f.type === "file" && /\.ya?ml$/i.test(f.name),
      )) {
        try {
          const result = api(`repos/${ORG}/${name}/contents/${file.path}?ref=${ref}`);
          if (result.encoding !== "base64" || typeof result.content !== "string")
            throw new Error("Workflow content unavailable");
          row.pins.push(
            ...workflowPins(
              Buffer.from(result.content, "base64").toString("utf8"),
              file.path,
            ),
          );
        } catch (error) {
          row.issues.push(`${file.path}: could not inspect workflow (${error.message})`);
        }
      }
      if (!row.pins.length) row.issues.push("no trailhead action ref found");
      for (const pin of row.pins) {
        // A SHA pin must equal the actual release commit, not merely look like a SHA.
        if (pin.ref !== expected && pin.ref.toLowerCase() !== expectedSha.toLowerCase()) {
          row.issues.push(
            `${pin.workflow}: ${pin.ref} (expected ${expected} or ${expectedSha})`,
          );
        }
      }
    } catch (error) {
      row.issues.push(`audit unavailable (${error.message})`);
    }
    return row;
  });
  return {
    expected: `@${expected}`,
    expectedSha,
    results,
    failing: results.filter((r) => r.issues.length > 0).length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = auditFleet({ version: process.env.EXPECTED_VERSION || "4.8.0" });
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Expected: ${report.expected} (${report.expectedSha})`);
      for (const row of report.results) {
        console.log(
          `- ${row.name}: ${row.archived ? "archived (skipped)" : row.issues.length ? "DRIFT / INCOMPLETE" : "ok"}`,
        );
        for (const pin of row.pins) console.log(`    ${pin.workflow} → @${pin.ref}`);
        for (const issue of row.issues) console.log(`    ${issue}`);
      }
      console.log(`${report.failing} repo(s) with drift or incomplete evidence`);
    }
    process.exitCode = report.failing ? 1 : 0;
  } catch (error) {
    console.error(`Fleet audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
