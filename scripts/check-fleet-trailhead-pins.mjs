#!/usr/bin/env node
/**
 * Audit fleet repos for Trailhead action pin drift.
 *
 * Fails (exit 1) when any consumer uses @v4 floating, an unexpected tag,
 * or a tag older than EXPECTED_VERSION.
 *
 * Usage:
 *   node scripts/check-fleet-trailhead-pins.mjs
 *   EXPECTED_VERSION=4.5.1 node scripts/check-fleet-trailhead-pins.mjs
 *   node scripts/check-fleet-trailhead-pins.mjs --json
 */

import { execFileSync } from "node:child_process";

const ORG = "KomatikAI";
const EXPECTED_VERSION = process.env.EXPECTED_VERSION || "4.5.2";
const EXPECTED_REF = `@v${EXPECTED_VERSION}`;
const FLOATING_REF = "@v4";
const jsonOut = process.argv.includes("--json");

const REPOS = [
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

const WORKFLOW_CANDIDATES = [
  ".github/workflows/trailhead.yml",
  ".github/workflows/deployguard.yml",
  ".github/workflows/ci.yml",
];

const ACTION_REGEX =
  /uses:\s*(KomatikAI\/(?:trailhead|deployguard)|dschirmer-shiftkey\/deployguard)@([^\s#]+)/g;

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGh(args) {
  try {
    return { ok: true, out: gh(args) };
  } catch (err) {
    return { ok: false, err: err.stderr?.toString?.() || err.message || String(err) };
  }
}

function parseVersion(ref) {
  const m = ref.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isOlderThanExpected(ref) {
  const got = parseVersion(ref);
  const want = parseVersion(`v${EXPECTED_VERSION}`);
  if (!got || !want) return false;
  for (let i = 0; i < 3; i++) {
    if (got[i] < want[i]) return true;
    if (got[i] > want[i]) return false;
  }
  return false;
}

function scanRepo(name) {
  const meta = JSON.parse(
    gh(["api", `repos/${ORG}/${name}`, "--jq", "{default_branch, archived}"]),
  );
  if (meta.archived) {
    return { name, archived: true, pins: [], issues: [] };
  }

  const pins = [];
  const issues = [];

  for (const path of WORKFLOW_CANDIDATES) {
    const res = tryGh([
      "api",
      `repos/${ORG}/${name}/contents/${path}?ref=${meta.default_branch}`,
      "--jq",
      "{content: .content}",
    ]);
    if (!res.ok) continue;
    const content = Buffer.from(JSON.parse(res.out).content, "base64").toString("utf8");
    for (const match of content.matchAll(ACTION_REGEX)) {
      pins.push({ workflow: path, ref: match[2] });
    }
  }

  if (pins.length === 0) {
    issues.push("no trailhead action ref found");
    return { name, default_branch: meta.default_branch, pins, issues };
  }

  for (const pin of pins) {
    if (pin.ref === "v4" || pin.ref === FLOATING_REF.replace("@", "")) {
      issues.push(`${pin.workflow}: floating @v4`);
    } else if (isOlderThanExpected(pin.ref)) {
      issues.push(`${pin.workflow}: ${pin.ref} older than ${EXPECTED_REF}`);
    } else if (pin.ref !== `v${EXPECTED_VERSION}`) {
      issues.push(`${pin.workflow}: ${pin.ref} (expected ${EXPECTED_REF})`);
    }
  }

  return { name, default_branch: meta.default_branch, pins, issues };
}

const results = REPOS.map(scanRepo);
const failing = results.filter((r) => r.issues.length > 0);

if (jsonOut) {
  console.log(
    JSON.stringify({ expected: EXPECTED_REF, results, failing: failing.length }, null, 2),
  );
} else {
  console.log(`Expected pin: KomatikAI/trailhead${EXPECTED_REF}\n`);
  for (const row of results) {
    if (row.archived) {
      console.log(`- ${row.name}: archived (skipped)`);
      continue;
    }
    const pinSummary =
      row.pins.length === 0
        ? "no workflow"
        : row.pins.map((p) => `${p.workflow} → @${p.ref}`).join(", ");
    const status = row.issues.length === 0 ? "ok" : "DRIFT";
    console.log(`- ${row.name}: ${status} — ${pinSummary}`);
    for (const issue of row.issues) {
      console.log(`    · ${issue}`);
    }
  }
  console.log(`\n${failing.length} repo(s) with drift`);
}

process.exit(failing.length > 0 ? 1 : 0);
