#!/usr/bin/env node
/**
 * Batch PRs: Trailhead DORA permissions + per-repo dora-environment.
 * Usage: node scripts/batch-dora-permissions-prs.mjs [--dry-run]
 */

const REPOS = [
  { name: "trace", doraEnvironment: null },
  { name: "pack", doraEnvironment: "Production" },
  { name: "cairn", doraEnvironment: "github-pages" },
  { name: "kindling", doraEnvironment: null },
  { name: "sundog", doraEnvironment: null },
  { name: "frontier", doraEnvironment: null },
  { name: "slipstream", doraEnvironment: null },
];

const BRANCH = "cursor/trailhead-dora-permissions";
const BASE = "dev";
const WORKFLOW_PATH = ".github/workflows/trailhead.yml";
const dryRun = process.argv.includes("--dry-run");

async function gh(args) {
  const proc = await import("node:child_process");
  const result = proc.execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.trim();
}

function patchWorkflow(content, doraEnvironment) {
  if (content.includes("actions: read") && content.includes("deployments: read")) {
    return { content, changed: false };
  }

  let next = content.replace(
    /(permissions:\n(?:  [^\n]+\n)*?  security-events: read)\n/,
    "$1\n  actions: read\n  deployments: read\n",
  );

  if (doraEnvironment && !next.includes("dora-environment:")) {
    next = next.replace(
      /(dora-metrics: "true"\n)/,
      `$1          dora-environment: "${doraEnvironment}"\n`,
    );
  }

  if (!next.includes("dora-fdrt")) {
    next = next.replace(
      /(echo "dora-rating:[^\n]*\n)/,
      `$1          echo "dora-fdrt:    \${{ steps.gate.outputs.dora-fdrt }}"\n`,
    );
  }

  return { content: next, changed: next !== content };
}

function bodyFor(repo, doraEnvironment) {
  const envLine = doraEnvironment
    ? `- Set \`dora-environment: "${doraEnvironment}"\` to match this repo's GitHub deployment environment`
    : "- No \`dora-environment\` — repo has no GitHub Deployments yet; FDRT uses evaluation-store fallback when available";

  return `## Summary
Enable Trailhead DORA deploy-based metrics (requires Trailhead \`@v4\` v4.2.2+).

- Add \`actions: read\` — deployment frequency (workflow runs API)
- Add \`deployments: read\` — FDRT (GitHub Deployments API)
${envLine}
- Log \`dora-fdrt\` in the gate summary step

## Test plan
- [ ] Open a PR after merge — DORA section should no longer show silent \`n/a\` FDRT when deploy data exists
- [ ] Deployment frequency should populate from push workflow runs (\`actions: read\`)
`;
}

async function processRepo({ name, doraEnvironment }) {
  const file = await gh([
    "api",
    `repos/KomatikAI/${name}/contents/${WORKFLOW_PATH}?ref=${BASE}`,
    "--jq",
    "{sha: .sha, content: .content}",
  ]);
  const { sha, content: b64 } = JSON.parse(file);
  const original = Buffer.from(b64, "base64").toString("utf8");
  const { content: patched, changed } = patchWorkflow(original, doraEnvironment);

  if (!changed) {
    console.log(`SKIP ${name}: already patched`);
    return null;
  }

  if (dryRun) {
    console.log(`DRY-RUN ${name}: would patch (${doraEnvironment ?? "no env"})`);
    return null;
  }

  const baseSha = await gh([
    "api",
    `repos/KomatikAI/${name}/git/ref/heads/${BASE}`,
    "--jq",
    ".object.sha",
  ]);

  try {
    await gh([
      "api",
      `repos/KomatikAI/${name}/git/refs`,
      "-f",
      `ref=refs/heads/${BRANCH}`,
      "-f",
      `sha=${baseSha}`,
    ]);
  } catch {
    // branch may exist
  }

  const encoded = Buffer.from(patched, "utf8").toString("base64");
  await gh([
    "api",
    `repos/KomatikAI/${name}/contents/${WORKFLOW_PATH}`,
    "-X",
    "PUT",
    "-f",
    "message=fix(ci): Trailhead DORA permissions for deploy metrics",
    "-f",
    `content=${encoded}`,
    "-f",
    `sha=${sha}`,
    "-f",
    `branch=${BRANCH}`,
  ]);

  const prUrl = await gh([
    "pr",
    "create",
    "--repo",
    `KomatikAI/${name}`,
    "--base",
    BASE,
    "--head",
    BRANCH,
    "--title",
    "fix(ci): Trailhead DORA permissions for deploy metrics",
    "--body",
    bodyFor(name, doraEnvironment),
  ]);

  console.log(`OK ${name}: ${prUrl}`);
  return prUrl;
}

const results = [];
for (const repo of REPOS) {
  try {
    const url = await processRepo(repo);
    if (url) results.push({ repo: repo.name, url });
  } catch (err) {
    console.error(`FAIL ${repo.name}:`, err.stderr?.toString?.() || err.message || err);
  }
}

if (results.length) {
  console.log("\n--- PRs created ---");
  for (const r of results) console.log(`${r.repo}: ${r.url}`);
}
