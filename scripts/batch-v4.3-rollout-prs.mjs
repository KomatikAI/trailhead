#!/usr/bin/env node
/**
 * A6 fleet rollout: pin Trailhead v4.3.0 + migrate evaluation store URL.
 *
 * Repos still on legacy deployguard store endpoint — active fleet only (see docs/komatik-hosted-store.md):
 *   cairn, frontier, kindling, pack, slipstream, sundog, trace
 * Excluded (retired/archived, trace absorbed): drift, floe, traverse, watchtower
 *
 * Deploy rule: Komatik schema/routes via PR only — never apply_migration to prod via MCP.
 *   1. Bump action ref → KomatikAI/trailhead@v4.3.0 (explicit tag, NOT @v4)
 *   2. Flip evaluation-store-url → .../api/trailhead/store
 *
 * Workflow file: `.github/workflows/trailhead.yml` or `deployguard.yml` (legacy filename).
 * Base branch: repo default (dev for satellites; main for komatik-agents).
 *
 * Usage:
 *   node scripts/batch-v4.3-rollout-prs.mjs             # dry-run
 *   node scripts/batch-v4.3-rollout-prs.mjs --apply     # open PRs
 *   node scripts/batch-v4.3-rollout-prs.mjs --only=kindling,sundog
 *   node scripts/batch-v4.3-rollout-prs.mjs --skip-missing-workflow
 *
 * Override release pin: TRAILHEAD_ROLLOUT_VERSION=4.3.0 node scripts/...
 */

import { execFileSync } from "node:child_process";

const ORG = "KomatikAI";
const ACTION_REPO = "KomatikAI/trailhead";
const BRANCH = "cursor/trailhead-v4.3.0-a6-rollout";
const WORKFLOW_CANDIDATES = [
  ".github/workflows/trailhead.yml",
  ".github/workflows/deployguard.yml",
];
const TARGET_VERSION = process.env.TRAILHEAD_ROLLOUT_VERSION || "4.3.0";
const TARGET_REF = `@v${TARGET_VERSION}`; // @v4.3.0
const LEGACY_STORE = "/api/deployguard/store";
const CANONICAL_STORE = "/api/trailhead/store";

/** Repos on legacy store URL — active fleet only. Retired: drift, floe, traverse, watchtower. */
const REPOS = [
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
const skipMissingWorkflow = args.has("--skip-missing-workflow");
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
    return {
      ok: false,
      err: err.stderr?.toString?.() || err.message || String(err),
      code: err.status,
    };
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
  if (!res.ok) {
    if (/Not Found|404/.test(res.err)) return null;
    throw new Error(`getFile ${name} ${path}: ${res.err}`);
  }
  const { sha, content: b64 } = JSON.parse(res.out);
  return { sha, content: Buffer.from(b64, "base64").toString("utf8"), path };
}

function findWorkflow(name, base) {
  for (const path of WORKFLOW_CANDIDATES) {
    const file = getFile(name, base, path);
    if (file) return file;
  }
  return null;
}

function patchWorkflow(content) {
  let actionChanged = false;
  let storeChanged = false;

  const actionRegex =
    /(uses:\s*)(?:KomatikAI\/(?:trailhead|deployguard)|dschirmer-shiftkey\/deployguard)@[^\s#]+/g;
  const nextAction = content.replace(actionRegex, (_, prefix) => {
    actionChanged = true;
    return `${prefix}${ACTION_REPO}${TARGET_REF}`;
  });

  const storeRegex = new RegExp(LEGACY_STORE.replace(/\//g, "\\/"), "g");
  const nextStore = nextAction.replace(storeRegex, () => {
    storeChanged = true;
    return CANONICAL_STORE;
  });

  const alreadyPinned = new RegExp(
    `${ACTION_REPO.replace("/", "\\/")}${TARGET_REF.replace(".", "\\.")}(?:\\s|$)`,
  ).test(content);
  const alreadyStore = !content.includes(LEGACY_STORE);

  return {
    content: nextStore,
    actionChanged: actionChanged && !alreadyPinned,
    storeChanged: storeChanged && !alreadyStore,
    alreadyPinned,
    alreadyStore,
  };
}

function prBody(name, plan) {
  const lines = [
    "## Summary",
    "",
    `Pin Trailhead to **${TARGET_REF}** and migrate the evaluation store URL to the canonical \`${CANONICAL_STORE}\` endpoint.`,
    "",
    "## What changes",
    "",
  ];

  if (plan.actionChanged) {
    lines.push(
      `- Bump action ref in \`${plan.workflowPath}\` to \`${ACTION_REPO}${TARGET_REF}\` (explicit tag; \`@v4\` remains on v4.2.2)`,
    );
  }
  if (plan.storeChanged) {
    lines.push(
      `- Migrate \`evaluation-store-url\` from \`${LEGACY_STORE}\` → \`${CANONICAL_STORE}\` (alias already live on komatik.ai)`,
    );
  }

  lines.push("");
  lines.push("## Why");
  lines.push("");
  lines.push(
    'v4.3.0 ships Phase A "Coach" (remediation schema, agent brief, semantic webhooks, loop bookkeeping). Explicit pin avoids the fleet-wide `@v4` tag move until deliberately approved.',
  );
  lines.push("");
  lines.push("## Rollback");
  lines.push("");
  lines.push(
    "Revert this PR to restore the previous action ref and store URL. The `/api/deployguard/store` alias remains until all consumers confirm migration.",
  );
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(
    `- Release: [${TARGET_REF}](https://github.com/${ACTION_REPO}/releases/tag/${TARGET_VERSION})`,
  );
  lines.push(
    `- Roadmap: [\`docs/roadmap-v4.3-agent-autonomy.md\`](https://github.com/${ACTION_REPO}/blob/main/docs/roadmap-v4.3-agent-autonomy.md) (A6)`,
  );

  return lines.join("\n");
}

function planRepo({ name }) {
  const { default_branch: base, archived } = getRepoMeta(name);
  if (archived) {
    return {
      base,
      hasWorkflow: false,
      skip: true,
      reason: "repo archived — unarchive before opening rollout PR",
      archived: true,
    };
  }
  const workflow = findWorkflow(name, base);
  if (!workflow) {
    return {
      base,
      hasWorkflow: false,
      skip: true,
      reason: "no trailhead.yml or deployguard.yml workflow",
    };
  }

  const patch = patchWorkflow(workflow.content);
  const noop = !patch.actionChanged && !patch.storeChanged;

  return {
    base,
    hasWorkflow: true,
    skip: noop,
    reason: noop ? `already on ${TARGET_REF} + ${CANONICAL_STORE}` : null,
    workflow: { ...workflow, content: patch.content },
    workflowPath: workflow.path,
    actionChanged: patch.actionChanged,
    storeChanged: patch.storeChanged,
  };
}

async function applyRepo({ name }, plan) {
  const baseSha = gh([
    "api",
    `repos/${ORG}/${name}/git/ref/heads/${plan.base}`,
    "--jq",
    ".object.sha",
  ]);

  const branchExists = tryGh([
    "api",
    `repos/${ORG}/${name}/git/ref/heads/${BRANCH}`,
    "--jq",
    ".object.sha",
  ]);

  if (!branchExists.ok) {
    const refCreate = tryGh([
      "api",
      `repos/${ORG}/${name}/git/refs`,
      "-f",
      `ref=refs/heads/${BRANCH}`,
      "-f",
      `sha=${baseSha}`,
    ]);
    if (!refCreate.ok && !/Reference already exists/.test(refCreate.err)) {
      throw new Error(`branch create ${name}: ${refCreate.err}`);
    }
  }

  let fileSha = plan.workflow.sha;
  let skipPut = false;
  const onBranch = getFile(name, BRANCH, plan.workflowPath);
  if (onBranch) {
    fileSha = onBranch.sha;
    if (onBranch.content === plan.workflow.content) {
      skipPut = true;
      const existingPr = tryGh([
        "pr",
        "list",
        "--repo",
        `${ORG}/${name}`,
        "--head",
        BRANCH,
        "--state",
        "open",
        "--json",
        "url",
        "--jq",
        ".[0].url",
      ]);
      if (existingPr.ok && existingPr.out) {
        return { url: existingPr.out, reused: true };
      }
    }
  }

  if (!skipPut) {
    const encoded = Buffer.from(plan.workflow.content, "utf8").toString("base64");
    const msgParts = [];
    if (plan.actionChanged) msgParts.push(`pin ${TARGET_REF}`);
    if (plan.storeChanged) msgParts.push("migrate store URL");
    gh([
      "api",
      `repos/${ORG}/${name}/contents/${plan.workflowPath}`,
      "-X",
      "PUT",
      "-f",
      `message=chore(trailhead): ${msgParts.join(" + ")}`,
      "-f",
      `content=${encoded}`,
      "-f",
      `sha=${fileSha}`,
      "-f",
      `branch=${BRANCH}`,
    ]);
  }

  const title = "chore(trailhead): pin v4.3.0 and migrate evaluation store URL";
  const prArgs = [
    "pr",
    "create",
    "--repo",
    `${ORG}/${name}`,
    "--base",
    plan.base,
    "--head",
    BRANCH,
    "--title",
    title,
    "--body",
    prBody(name, plan),
  ];
  const prCreate = tryGh(prArgs);

  if (!prCreate.ok) {
    if (/already exists/.test(prCreate.err)) {
      const url = gh([
        "pr",
        "list",
        "--repo",
        `${ORG}/${name}`,
        "--head",
        BRANCH,
        "--state",
        "open",
        "--json",
        "url",
        "--jq",
        ".[0].url",
      ]);
      return { url, reused: true };
    }
    throw new Error(prCreate.err);
  }

  tryGh([
    "pr",
    "edit",
    prCreate.out.split("/").pop(),
    "--repo",
    `${ORG}/${name}`,
    "--add-label",
    "trailhead-v4.3-rollout",
  ]);

  return { url: prCreate.out, reused: false };
}

const results = [];
const repos = REPOS.filter((r) => !onlyList || onlyList.has(r.name));

for (const repo of repos) {
  try {
    const plan = planRepo(repo);

    if (!plan.hasWorkflow) {
      const tag = plan.archived ? "ARCHIVED" : skipMissingWorkflow ? "SKIP" : "MISSING";
      const hint = plan.archived
        ? ""
        : skipMissingWorkflow
          ? ""
          : " (use --skip-missing-workflow to silence)";
      console.log(`${tag} ${repo.name}: ${plan.reason}${hint}`);
      continue;
    }

    if (plan.skip) {
      console.log(`SKIP ${repo.name}: ${plan.reason}`);
      continue;
    }

    if (!apply) {
      const parts = [];
      if (plan.actionChanged) parts.push(`pin → ${TARGET_REF}`);
      if (plan.storeChanged) parts.push(`store → ${CANONICAL_STORE}`);
      console.log(
        `PLAN ${repo.name} (base=${plan.base}, ${plan.workflowPath}): ${parts.join(" + ")}`,
      );
      results.push({ repo: repo.name, planned: true });
      continue;
    }

    const out = await applyRepo(repo, plan);
    console.log(`OK ${repo.name}: ${out.url}${out.reused ? " (reused)" : ""}`);
    results.push({ repo: repo.name, url: out.url, reused: out.reused });
  } catch (err) {
    console.error(`FAIL ${repo.name}:`, err.message || err);
    results.push({ repo: repo.name, error: err.message || String(err) });
  }
}

const opened = results.filter((r) => r.url);
const planned = results.filter((r) => r.planned);
const failed = results.filter((r) => r.error);

console.log("\n--- Summary ---");
console.log(`Action ref: ${ACTION_REPO}${TARGET_REF}`);
console.log(`Store URL:  ${CANONICAL_STORE}`);
console.log(`Mode:       ${apply ? "APPLY" : "DRY-RUN"}`);
console.log(`Repos seen: ${repos.length}`);
console.log(`Planned:    ${planned.length}`);
console.log(`Opened:     ${opened.length}`);
console.log(`Failed:     ${failed.length}`);

if (opened.length) {
  console.log("\n--- PRs ---");
  for (const r of opened)
    console.log(`${r.repo}: ${r.url}${r.reused ? " (reused)" : ""}`);
}
if (failed.length) {
  console.log("\n--- Failures ---");
  for (const r of failed) console.log(`${r.repo}: ${r.error}`);
}

process.exit(failed.length ? 1 : 0);
