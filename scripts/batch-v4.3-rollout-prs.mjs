#!/usr/bin/env node
/**
 * Batch PRs: adopt Trailhead v4.3 strict-agent gate + remediation loop.
 *
 * Per repo:
 *   1. Bump  @v4  →  @v4.3  in .github/workflows/trailhead.yml (when present)
 *   2. Add (or create) .trailhead.yml with `presets: ["@trailhead/strict-agents"]`
 *   3. Open a PR titled "chore(trailhead): adopt v4.3 strict-agent gate + remediation loop"
 *
 * Usage:
 *   node scripts/batch-v4.3-rollout-prs.mjs             # dry-run, prints per-repo plan
 *   node scripts/batch-v4.3-rollout-prs.mjs --apply     # actually opens PRs
 *   node scripts/batch-v4.3-rollout-prs.mjs --only=kindling,sundog
 *   node scripts/batch-v4.3-rollout-prs.mjs --skip-missing-workflow
 *
 * Safety:
 *   - Idempotent: SKIPs any repo already pinned to @v4.3 and already opted into the preset.
 *   - Each repo gets its own branch `cursor/trailhead-v4.3-rollout` so retries are easy.
 *   - PR body includes a 1-line rollback recipe.
 *   - Reads the action version from package.json so a future v4.4 rollout reuses this script.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REPOS = [
  // Base Camp monitored (14)
  { name: "Komatik", org: "KomatikAI", base: "main" },
  { name: "komatik-agents", org: "KomatikAI", base: "main" },
  { name: "komatik-base-camp", org: "KomatikAI", base: "main" },
  { name: "deployguard", org: "KomatikAI", base: "main" },
  { name: "daydream-studio", org: "KomatikAI", base: "main" },
  { name: "storyboard-studio", org: "KomatikAI", base: "main" },
  { name: "shieldcheck", org: "KomatikAI", base: "main" },
  { name: "reviewflow", org: "KomatikAI", base: "main" },
  { name: "mcp-brokerage", org: "KomatikAI", base: "main" },
  { name: "rescue-engineering", org: "KomatikAI", base: "main" },
  { name: "shadow-ai-governance", org: "KomatikAI", base: "main" },
  { name: "drift", org: "KomatikAI", base: "main" },
  { name: "komatik-yggdrasil", org: "KomatikAI", base: "main" },
  { name: "Bored", org: "KomatikAI", base: "main" },
  // DORA-enabled satellites (7)
  { name: "trace", org: "KomatikAI", base: "main" },
  { name: "pack", org: "KomatikAI", base: "main" },
  { name: "cairn", org: "KomatikAI", base: "main" },
  { name: "kindling", org: "KomatikAI", base: "main" },
  { name: "sundog", org: "KomatikAI", base: "main" },
  { name: "frontier", org: "KomatikAI", base: "main" },
  { name: "slipstream", org: "KomatikAI", base: "main" },
];

const BRANCH = "cursor/trailhead-v4.3-rollout";
const WORKFLOW_PATH = ".github/workflows/trailhead.yml";
const CONFIG_PATH = ".trailhead.yml";
const PRESET_KEY = "@trailhead/strict-agents";
const ACTION_REPO = "KomatikAI/trailhead";

// Read the desired action version from this repo's package.json so the script
// stays in sync with the latest release tag.
const PKG = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
const ACTION_VERSION_MAJOR_MINOR =
  process.env.TRAILHEAD_ROLLOUT_VERSION || PKG.version.split(".").slice(0, 2).join("."); // e.g. "4.3"
const TARGET_REF = `@v${ACTION_VERSION_MAJOR_MINOR}`; // "@v4.3"

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

function getFile(org, name, ref, path) {
  const res = tryGh([
    "api",
    `repos/${org}/${name}/contents/${path}?ref=${ref}`,
    "--jq",
    "{sha: .sha, content: .content}",
  ]);
  if (!res.ok) {
    if (/Not Found|404/.test(res.err)) return null;
    throw new Error(`getFile ${org}/${name} ${path}: ${res.err}`);
  }
  const { sha, content: b64 } = JSON.parse(res.out);
  return { sha, content: Buffer.from(b64, "base64").toString("utf8") };
}

function bumpWorkflowRef(content) {
  // Trailhead Action uses (a) KomatikAI/trailhead@vX and (b) KomatikAI/deployguard@vX (legacy alias).
  // Match either, only the @v<num> form (don't touch SHA pins or @v4.2.1 etc.).
  const refRegex = /(uses:\s*KomatikAI\/(trailhead|deployguard))@v\d+(?:\.\d+)?(?!\.\d)/g;
  let changed = false;
  const patched = content.replace(refRegex, (_, prefix) => {
    changed = true;
    return `${prefix}${TARGET_REF}`;
  });
  return { content: patched, changed };
}

function ensureConfigHasPreset(content) {
  if (content === null) {
    return {
      content: [
        "# Trailhead config — adopted v4.3 strict-agents preset",
        "schema_version: 1",
        `presets:`,
        `  - "${PRESET_KEY}"`,
        "",
      ].join("\n"),
      changed: true,
      created: true,
    };
  }

  if (
    /^\s*-\s*["']?@trailhead\/strict-agents["']?\s*$/m.test(content) ||
    /presets:\s*\[[^\]]*@trailhead\/strict-agents[^\]]*\]/.test(content)
  ) {
    return { content, changed: false, created: false };
  }

  if (/^presets:\s*$/m.test(content) || /^presets:\s*\n(?:\s+-\s+.*\n)+/m.test(content)) {
    const next = content.replace(
      /(^presets:\s*\n(?:\s+-\s+.*\n)*)/m,
      (block) => `${block}  - "${PRESET_KEY}"\n`,
    );
    return { content: next, changed: next !== content, created: false };
  }

  const next =
    content + (content.endsWith("\n") ? "" : "\n") + `presets:\n  - "${PRESET_KEY}"\n`;
  return { content: next, changed: true, created: false };
}

function prBody(repo, plan) {
  const lines = [
    "## Summary",
    "",
    `Adopt Trailhead **v4.3** (\`${TARGET_REF}\`) and opt this repo into the strict-agent gate + remediation loop.`,
    "",
    "## What changes",
    "",
  ];

  if (plan.workflowBumped) {
    lines.push(`- Bump action ref in \`${WORKFLOW_PATH}\` to \`${TARGET_REF}\``);
  }
  if (plan.configCreated) {
    lines.push(`- Create \`${CONFIG_PATH}\` opting into the \`${PRESET_KEY}\` preset`);
  } else if (plan.presetAdded) {
    lines.push(`- Add \`${PRESET_KEY}\` to \`${CONFIG_PATH}\` presets list`);
  }

  lines.push("");
  lines.push("## Behavior change");
  lines.push("");
  lines.push("- **Human PRs:** unchanged (mode falls back to existing config)");
  lines.push(
    "- **Agent-provenance PRs:** strict thresholds (risk 40, max_files 30) and a structured Remediation block agents can act on. Up to 5 fix-and-retry rounds per PR.",
  );
  lines.push("");
  lines.push("## Escape valve");
  lines.push("");
  lines.push(
    "Label any PR with `trailhead-override` and add a comment matching `trailhead-override: <reason>` to bypass the gate. All overrides are audited.",
  );
  lines.push("");
  lines.push("## Rollback");
  lines.push("");
  lines.push(
    `If anything goes sideways: revert this PR — Trailhead falls back to the previous \`@v4\` behavior immediately.`,
  );
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`- Epic: ${ACTION_REPO}#223`);
  lines.push(
    `- Roadmap: [\`docs/roadmap-v4.3-agent-autonomy.md\`](https://github.com/${ACTION_REPO}/blob/main/docs/roadmap-v4.3-agent-autonomy.md)`,
  );

  return lines.join("\n");
}

function planRepo({ org, name, base }) {
  const workflow = getFile(org, name, base, WORKFLOW_PATH);
  if (!workflow) {
    return {
      hasWorkflow: false,
      skip: true,
      reason: "no .github/workflows/trailhead.yml",
    };
  }

  const bumpResult = bumpWorkflowRef(workflow.content);
  const config = getFile(org, name, base, CONFIG_PATH);
  const presetResult = ensureConfigHasPreset(config?.content ?? null);

  const noop = !bumpResult.changed && !presetResult.changed;

  return {
    hasWorkflow: true,
    skip: noop,
    reason: noop ? "already adopted v4.3 + strict-agents preset" : null,
    workflow: { ...workflow, ...bumpResult },
    config: config ? { ...config, ...presetResult } : { sha: null, ...presetResult },
    workflowBumped: bumpResult.changed,
    presetAdded: !presetResult.created && presetResult.changed,
    configCreated: presetResult.created,
  };
}

async function applyRepo({ org, name, base }, plan) {
  const baseSha = gh([
    "api",
    `repos/${org}/${name}/git/ref/heads/${base}`,
    "--jq",
    ".object.sha",
  ]);

  const refCreate = tryGh([
    "api",
    `repos/${org}/${name}/git/refs`,
    "-f",
    `ref=refs/heads/${BRANCH}`,
    "-f",
    `sha=${baseSha}`,
  ]);
  if (!refCreate.ok && !/Reference already exists/.test(refCreate.err)) {
    throw new Error(`branch create ${org}/${name}: ${refCreate.err}`);
  }

  if (plan.workflowBumped) {
    const encoded = Buffer.from(plan.workflow.content, "utf8").toString("base64");
    gh([
      "api",
      `repos/${org}/${name}/contents/${WORKFLOW_PATH}`,
      "-X",
      "PUT",
      "-f",
      `message=chore(trailhead): bump action ref to ${TARGET_REF}`,
      "-f",
      `content=${encoded}`,
      "-f",
      `sha=${plan.workflow.sha}`,
      "-f",
      `branch=${BRANCH}`,
    ]);
  }

  if (plan.presetAdded || plan.configCreated) {
    const encoded = Buffer.from(plan.config.content, "utf8").toString("base64");
    const args = [
      "api",
      `repos/${org}/${name}/contents/${CONFIG_PATH}`,
      "-X",
      "PUT",
      "-f",
      `message=chore(trailhead): opt in to ${PRESET_KEY} preset`,
      "-f",
      `content=${encoded}`,
      "-f",
      `branch=${BRANCH}`,
    ];
    if (plan.config.sha) {
      args.push("-f", `sha=${plan.config.sha}`);
    }
    gh(args);
  }

  const prCreate = tryGh([
    "pr",
    "create",
    "--repo",
    `${org}/${name}`,
    "--base",
    base,
    "--head",
    BRANCH,
    "--title",
    "chore(trailhead): adopt v4.3 strict-agent gate + remediation loop",
    "--label",
    "trailhead-v4.3-rollout",
    "--body",
    prBody(name, plan),
  ]);

  if (!prCreate.ok) {
    if (/already exists/.test(prCreate.err)) {
      const url = gh([
        "pr",
        "list",
        "--repo",
        `${org}/${name}`,
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

  return { url: prCreate.out, reused: false };
}

const results = [];
const repos = REPOS.filter((r) => !onlyList || onlyList.has(r.name));

for (const repo of repos) {
  try {
    const plan = planRepo(repo);

    if (!plan.hasWorkflow) {
      if (skipMissingWorkflow) {
        console.log(`SKIP ${repo.name}: ${plan.reason}`);
      } else {
        console.log(
          `MISSING ${repo.name}: ${plan.reason} (use --skip-missing-workflow to silence)`,
        );
      }
      continue;
    }

    if (plan.skip) {
      console.log(`SKIP ${repo.name}: ${plan.reason}`);
      continue;
    }

    if (!apply) {
      const parts = [];
      if (plan.workflowBumped) parts.push(`bump workflow → ${TARGET_REF}`);
      if (plan.configCreated) parts.push(`create ${CONFIG_PATH}`);
      else if (plan.presetAdded) parts.push(`add ${PRESET_KEY} preset`);
      console.log(`PLAN ${repo.name}: ${parts.join(" + ")}`);
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
console.log(`Action ref: ${TARGET_REF}`);
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
