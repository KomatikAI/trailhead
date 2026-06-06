#!/usr/bin/env node
/**
 * Pin fleet consumers to Trailhead v4.5.1 (warehouse audit release).
 *
 * Usage:
 *   node scripts/batch-v4.5.1-rollout-prs.mjs
 *   node scripts/batch-v4.5.1-rollout-prs.mjs --apply
 *   node scripts/batch-v4.5.1-rollout-prs.mjs --only=komatik,agents
 */

import { execFileSync } from "node:child_process";

const ORG = "KomatikAI";
const ACTION_REPO = "KomatikAI/trailhead";
const BRANCH = "cursor/trailhead-v4.5.1-rollout";
const WORKFLOW_CANDIDATES = [
  ".github/workflows/trailhead.yml",
  ".github/workflows/deployguard.yml",
];
const TARGET_VERSION = process.env.TRAILHEAD_ROLLOUT_VERSION || "4.5.1";
const TARGET_REF = `@v${TARGET_VERSION}`;

const REPOS = [
  { name: "komatik" },
  { name: "agents", workflowPath: ".github/workflows/ci.yml" },
  { name: "cairn" },
  { name: "frontier" },
  { name: "kindling" },
  { name: "pack" },
  { name: "slipstream" },
  { name: "sundog" },
  { name: "trace" },
];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyList = onlyArg
  ? new Set(
      onlyArg
        .replace("--only=", "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

function gh(ghArgs) {
  return execFileSync("gh", ghArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGh(ghArgs) {
  try {
    return { ok: true, out: gh(ghArgs) };
  } catch (err) {
    return { ok: false, err: err.stderr?.toString?.() || err.message || String(err) };
  }
}

function getRepoMeta(name) {
  return JSON.parse(
    gh(["api", `repos/${ORG}/${name}`, "--jq", "{default_branch, archived}"]),
  );
}

function getFile(name, ref, path) {
  const res = tryGh([
    "api",
    `repos/${ORG}/${name}/contents/${path}?ref=${ref}`,
    "--jq",
    "{sha: .sha, content: .content}",
  ]);
  if (!res.ok) return null;
  const { sha, content: b64 } = JSON.parse(res.out);
  return { sha, content: Buffer.from(b64, "base64").toString("utf8"), path };
}

function findWorkflow(name, base, preferredPath) {
  const paths = preferredPath
    ? [preferredPath, ...WORKFLOW_CANDIDATES]
    : WORKFLOW_CANDIDATES;
  for (const path of [...new Set(paths)]) {
    const file = getFile(name, base, path);
    if (file) return file;
  }
  return null;
}

function patchWorkflow(content, { addReleaseReady = false } = {}) {
  let actionChanged = false;
  const actionRegex =
    /(uses:\s*)(?:KomatikAI\/(?:trailhead|deployguard)|dschirmer-shiftkey\/deployguard)@[^\s#]+/g;
  let next = content.replace(actionRegex, (_, prefix) => {
    actionChanged = true;
    return `${prefix}${ACTION_REPO}${TARGET_REF}`;
  });

  let gateModeChanged = false;
  if (addReleaseReady && !/gate-mode:\s*["']?release-ready/.test(next)) {
    next = next.replace(
      /(uses:\s*KomatikAI\/trailhead@v[^\n]+\n\s+id:\s*gate\n\s+with:\s*\n)/,
      `$1          gate-mode: "release-ready"\n`,
    );
    gateModeChanged = /gate-mode:\s*["']?release-ready/.test(next);
  }

  const alreadyPinned = new RegExp(
    `${ACTION_REPO.replace("/", "\\/")}${TARGET_REF.replace(".", "\\.")}`,
  ).test(content);

  return {
    content: next,
    actionChanged: actionChanged && !alreadyPinned,
    gateModeChanged,
    alreadyPinned,
  };
}

function planRepo({ name, workflowPath }) {
  const { default_branch: base, archived } = getRepoMeta(name);
  if (archived) return { base, skip: true, reason: "archived" };
  const workflow = findWorkflow(name, base, workflowPath);
  if (!workflow) return { base, skip: true, reason: "no workflow" };
  const patch = patchWorkflow(workflow.content, { addReleaseReady: name === "komatik" });
  const noop = !patch.actionChanged && !patch.gateModeChanged;
  return {
    base,
    skip: noop,
    reason: noop ? `already on ${TARGET_REF}` : null,
    workflow: { ...workflow, content: patch.content },
    workflowPath: workflow.path,
    actionChanged: patch.actionChanged,
    gateModeChanged: patch.gateModeChanged,
  };
}

async function applyRepo({ name }, plan) {
  const baseSha = gh([
    "api",
    `repos/${ORG}/${name}/git/ref/heads/${plan.base}`,
    "--jq",
    ".object.sha",
  ]);
  tryGh([
    "api",
    `repos/${ORG}/${name}/git/refs`,
    "-f",
    `ref=refs/heads/${BRANCH}`,
    "-f",
    `sha=${baseSha}`,
  ]);
  const encoded = Buffer.from(plan.workflow.content, "utf8").toString("base64");
  const msg = [
    plan.actionChanged ? `pin ${TARGET_REF}` : null,
    plan.gateModeChanged ? "gate-mode release-ready" : null,
  ]
    .filter(Boolean)
    .join(" + ");
  gh([
    "api",
    `repos/${ORG}/${name}/contents/${plan.workflowPath}`,
    "-X",
    "PUT",
    "-f",
    `message=chore(trailhead): ${msg}`,
    "-f",
    `content=${encoded}`,
    "-f",
    `sha=${plan.workflow.sha}`,
    "-f",
    `branch=${BRANCH}`,
  ]);
  return gh([
    "pr",
    "create",
    "--repo",
    `${ORG}/${name}`,
    "--base",
    plan.base,
    "--head",
    BRANCH,
    "--title",
    `chore(trailhead): pin ${TARGET_REF}${plan.gateModeChanged ? " + release-ready mode" : ""}`,
    "--body",
    `Pin Trailhead to **${TARGET_REF}** (warehouse audit release #280).\n\nRun \`node scripts/check-fleet-trailhead-pins.mjs\` after merge.`,
  ]);
}

const selected = REPOS.filter((r) => !onlyList || onlyList.has(r.name));
console.log(`Target: ${ACTION_REPO}${TARGET_REF} (${selected.length} repos)\n`);

for (const repo of selected) {
  const plan = planRepo(repo);
  if (plan.skip) {
    console.log(`SKIP ${repo.name}: ${plan.reason}`);
    continue;
  }
  console.log(
    `PLAN ${repo.name}: ${plan.workflowPath}` +
      (plan.actionChanged ? " pin" : "") +
      (plan.gateModeChanged ? " gate-mode" : ""),
  );
  if (apply) {
    const url = await applyRepo(repo, plan);
    console.log(`  PR ${url}`);
  }
}

if (!apply) console.log("\nDry-run — pass --apply to open PRs");
