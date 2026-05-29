#!/usr/bin/env node
/**
 * A6 / #229 — adopt strict-agent preset (.trailhead.yml) across Base Camp repos.
 *
 * Skips repos that already have policies.agent_prs.enabled: true.
 * Does not modify workflow pins (see batch-v4.3-rollout-prs.mjs).
 *
 * Usage:
 *   node scripts/batch-strict-preset-prs.mjs
 *   node scripts/batch-strict-preset-prs.mjs --apply
 *   node scripts/batch-strict-preset-prs.mjs --only=Komatik,shieldcheck
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ORG = "KomatikAI";
const BRANCH = "cursor/trailhead-strict-agents-preset";
const CONFIG_PATH = ".trailhead.yml";
const PRESET_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "presets",
  "trailhead-strict-agents.yml",
);
const PRESET_CONTENT = readFileSync(PRESET_PATH, "utf8");

/** 21-repo fleet minus retired/archived and this repo. */
const REPOS = [
  { name: "Komatik", base: "dev" },
  { name: "komatik-agents", base: "main" },
  { name: "komatik-base-camp", base: "dev" },
  { name: "daydream-studio", base: "dev" },
  { name: "storyboard-studio", base: "dev" },
  { name: "shieldcheck", base: "dev" },
  { name: "reviewflow", base: "dev" },
  { name: "mcp-brokerage", base: "dev" },
  { name: "rescue-engineering", base: "dev" },
  { name: "shadow-ai-governance", base: "dev" },
  { name: "komatik-yggdrasil", base: "dev" },
  { name: "Bored", base: "dev" },
  { name: "cairn", base: "dev" },
  { name: "frontier", base: "dev" },
  { name: "kindling", base: "dev" },
  { name: "pack", base: "dev" },
  { name: "slipstream", base: "dev" },
  { name: "sundog", base: "dev" },
  { name: "trace", base: "dev" },
];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyList = onlyArg
  ? new Set(
      onlyArg
        .replace("--only=", "")
        .split(",")
        .map((s) => s.trim()),
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

function getFile(name, ref, filePath) {
  const res = tryGh([
    "api",
    `repos/${ORG}/${name}/contents/${filePath}?ref=${ref}`,
    "--jq",
    "{sha: .sha, content: .content}",
  ]);
  if (!res.ok) return null;
  const { sha, content } = JSON.parse(res.out);
  return {
    sha,
    content: Buffer.from(content, "base64").toString("utf8"),
    path: filePath,
  };
}

function hasStrictAgentPreset(content) {
  return (
    /agent_prs:\s*\n[\s\S]*?enabled:\s*true/.test(content) &&
    /risk_threshold:\s*40/.test(content)
  );
}

function planRepo(repo) {
  const meta = JSON.parse(
    gh(["api", `repos/${ORG}/${repo.name}`, "--jq", "{archived: .archived}"]),
  );
  if (meta.archived) {
    return { skip: true, reason: "archived" };
  }

  const existing = getFile(repo.name, repo.base, CONFIG_PATH);
  if (existing && hasStrictAgentPreset(existing.content)) {
    return { skip: true, reason: "strict preset already present", base: repo.base };
  }

  return {
    skip: false,
    base: repo.base,
    existing,
    content: PRESET_CONTENT,
    action: existing ? "replace" : "create",
  };
}

function prBody(name, plan) {
  return [
    "## Summary",
    "",
    "Adopt the Trailhead **strict-agent** preset for Phase A coach mode.",
    "",
    "## What changes",
    "",
    plan.action === "create"
      ? `- Add \`${CONFIG_PATH}\` from [\`presets/trailhead-strict-agents.yml\`](https://github.com/KomatikAI/trailhead/blob/main/presets/trailhead-strict-agents.yml)`
      : `- Replace \`${CONFIG_PATH}\` with the fleet strict-agent preset (prior config was minimal or missing agent_prs)`,
    "",
    "Key settings: `agent_prs.risk_threshold: 40`, blocking CI/workflow/prompt policies, remediation loop (5 rounds), override cap.",
    "",
    "## Rollback",
    "",
    "Revert this PR to restore the previous `.trailhead.yml`.",
  ].join("\n");
}

function applyRepo(repo, plan) {
  const baseSha = gh([
    "api",
    `repos/${ORG}/${repo.name}/git/ref/heads/${plan.base}`,
    "--jq",
    ".object.sha",
  ]);

  if (
    !tryGh([
      "api",
      `repos/${ORG}/${repo.name}/git/ref/heads/${BRANCH}`,
      "--jq",
      ".object.sha",
    ]).ok
  ) {
    const created = tryGh([
      "api",
      `repos/${ORG}/${repo.name}/git/refs`,
      "-f",
      `ref=refs/heads/${BRANCH}`,
      "-f",
      `sha=${baseSha}`,
    ]);
    if (!created.ok && !/Reference already exists/.test(created.err)) {
      throw new Error(`branch create: ${created.err}`);
    }
  }

  const payload = {
    message: "chore(trailhead): adopt strict-agent preset (Phase A)",
    content: Buffer.from(plan.content).toString("base64"),
    branch: BRANCH,
  };
  if (plan.existing?.sha) payload.sha = plan.existing.sha;

  gh([
    "api",
    "-X",
    "PUT",
    `repos/${ORG}/${repo.name}/contents/${CONFIG_PATH}`,
    "-f",
    `message=${payload.message}`,
    "-f",
    `content=${payload.content}`,
    "-f",
    `branch=${BRANCH}`,
    ...(payload.sha ? ["-f", `sha=${payload.sha}`] : []),
  ]);

  const existingPr = tryGh([
    "pr",
    "list",
    "--repo",
    `${ORG}/${repo.name}`,
    "--head",
    BRANCH,
    "--state",
    "open",
    "--json",
    "url",
    "--jq",
    ".[0].url",
  ]);
  if (existingPr.ok && existingPr.out) return existingPr.out;

  return gh([
    "pr",
    "create",
    "--repo",
    `${ORG}/${repo.name}`,
    "--base",
    plan.base,
    "--head",
    BRANCH,
    "--title",
    "chore(trailhead): adopt strict-agent preset (Phase A)",
    "--body",
    prBody(repo.name, plan),
  ]);
}

const targets = REPOS.filter((r) => !onlyList || onlyList.has(r.name));
let planned = 0;
let opened = 0;
const prUrls = [];

for (const repo of targets) {
  const plan = planRepo(repo);
  if (plan.skip) {
    console.log(`SKIP ${repo.name}: ${plan.reason}`);
    continue;
  }
  planned += 1;
  if (!apply) {
    console.log(`PLAN ${repo.name} (base=${plan.base}): ${plan.action} ${CONFIG_PATH}`);
    continue;
  }
  try {
    const url = applyRepo(repo, plan);
    opened += 1;
    prUrls.push({ repo: repo.name, url });
    console.log(`OK ${repo.name}: ${url}`);
  } catch (err) {
    console.error(`FAIL ${repo.name}: ${err.message || err}`);
  }
}

console.log("\n--- Summary ---");
console.log(`Mode:       ${apply ? "APPLY" : "DRY-RUN"}`);
console.log(`Repos:      ${targets.length}`);
console.log(`Planned:    ${planned}`);
console.log(`Opened:     ${opened}`);
if (prUrls.length) {
  console.log("\n--- PRs ---");
  for (const { repo, url } of prUrls) console.log(`${repo}: ${url}`);
}
