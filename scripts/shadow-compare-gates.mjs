#!/usr/bin/env node
/**
 * Shadow comparison: komatik-agents legacy gate vs trailhead validate-submission.
 * Uses per-submission projectSlug package.json resolution (legacy parity).
 *
 * Usage:
 *   KOMATIK_AGENTS_ROOT=/path/to/agents node scripts/shadow-compare-gates.mjs
 *   TRAILHEAD_CLI=cli/dist/index.js node scripts/shadow-compare-gates.mjs --examples 25
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAILHEAD_ROOT = path.resolve(__dirname, "..");
const AGENTS_ROOT = process.env.KOMATIK_AGENTS_ROOT || "/tmp/agents-shadow";
const TRAILHEAD_CLI =
  process.env.TRAILHEAD_CLI || path.join(TRAILHEAD_ROOT, "cli/dist/index.js");
const NODE_PATH = process.env.NODE_PATH || path.join(TRAILHEAD_ROOT, "node_modules");
const MAX_FILE_BYTES = 1_000_000;

const SHARED_CHECKS = [
  "secrets",
  "destructive_sql",
  "syntax_validity",
  "mock_placeholder",
  "hardcoded_env",
  "external_package_deps",
  "sql_syntax_basic",
  "large_file",
  "context_freshness",
];

function parseArgs(argv) {
  const args = { outputDir: TRAILHEAD_ROOT, examples: 5 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--output-dir") args.outputDir = path.resolve(argv[(i += 1)]);
    else if (argv[i] === "--examples") args.examples = parseInt(argv[(i += 1)], 10) || 5;
    else if (argv[i] === "--agents-root") args.agentsRoot = path.resolve(argv[(i += 1)]);
  }
  args.agentsRoot = args.agentsRoot || AGENTS_ROOT;
  return args;
}

function declaredFromPackageJson(pkg) {
  return [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ];
}

function loadProjectPackageJson(rootDir, projectSlug) {
  const candidates = [
    path.join(rootDir, projectSlug, "package.json"),
    path.join(rootDir, "projects", projectSlug, "package.json"),
    path.join(rootDir, "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return declaredFromPackageJson(JSON.parse(fs.readFileSync(candidate, "utf8")));
      }
    } catch {
      // skip malformed
    }
  }
  return [];
}

function runOldGate(agentsRoot) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-old-"));
  execFileSync(
    "node",
    [
      path.join(agentsRoot, "scripts/validate-suggestions.js"),
      "--all",
      "--output-dir",
      out,
    ],
    { cwd: agentsRoot, stdio: ["ignore", "ignore", "inherit"] },
  );
  return JSON.parse(fs.readFileSync(path.join(out, "validation-report.json"), "utf8"));
}

function readFileSafe(agentsRoot, rel) {
  try {
    const abs = path.join(agentsRoot, rel);
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function runTrailhead(files, declaredPackages) {
  const payload = JSON.stringify({
    files,
    komatikInstance: true,
    mode: "block",
    declaredPackages,
  });
  const stdout = execFileSync("node", [TRAILHEAD_CLI, "validate-submission"], {
    input: payload,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_PATH },
  });
  return JSON.parse(stdout);
}

function oldFlagged(results, code) {
  const r = results.find((x) => x.type === code);
  return !!r && r.score > 0;
}

function thFlagged(checks, code) {
  return checks.some((c) => c.code === code);
}

function projectSlugFromBundle(suggestionRoot) {
  const match = String(suggestionRoot).match(/\/suggestions\/([^/]+)/);
  return match?.[1] ?? "unknown";
}

const args = parseArgs(process.argv);
if (!fs.existsSync(TRAILHEAD_CLI)) {
  console.error(
    `Trailhead CLI not found at ${TRAILHEAD_CLI}. Run: cd cli && npm run build`,
  );
  process.exit(2);
}
if (!fs.existsSync(path.join(args.agentsRoot, "scripts/validate-suggestions.js"))) {
  console.error(
    `komatik-agents not found at ${args.agentsRoot}. Set KOMATIK_AGENTS_ROOT.`,
  );
  process.exit(2);
}

console.error("Running legacy gate (validate-suggestions --all)…");
const oldReport = runOldGate(args.agentsRoot);
const submissions = oldReport.submissions || [];
console.error(`Comparing ${submissions.length} submission bundle(s)…`);

const tally = Object.fromEntries(
  SHARED_CHECKS.map((c) => [c, { agree: 0, oldOnly: 0, thOnly: 0 }]),
);
const divergences = [];
let bundlesCompared = 0;
let bundlesErrored = 0;

for (const sub of submissions) {
  const files = (sub.files || [])
    .map((rel) => ({ filename: rel, content: readFileSafe(args.agentsRoot, rel) }))
    .filter((f) => typeof f.content === "string");
  if (files.length === 0) continue;

  const slug = sub.projectSlug || projectSlugFromBundle(sub.suggestion_root);
  const declaredPackages = loadProjectPackageJson(args.agentsRoot, slug);

  let th;
  try {
    th = runTrailhead(files, declaredPackages);
  } catch (err) {
    bundlesErrored += 1;
    divergences.push({
      bundle: sub.suggestion_root,
      kind: "th-error",
      error: String(err).slice(0, 200),
    });
    continue;
  }
  bundlesCompared += 1;

  for (const code of SHARED_CHECKS) {
    const o = oldFlagged(sub.results || [], code);
    const t = thFlagged(th.checks || [], code);
    if (o === t) tally[code].agree += 1;
    else if (o && !t) {
      tally[code].oldOnly += 1;
      divergences.push({
        bundle: sub.suggestion_root,
        code,
        kind: "old-only",
        projectSlug: slug,
      });
    } else {
      tally[code].thOnly += 1;
      divergences.push({
        bundle: sub.suggestion_root,
        code,
        kind: "trailhead-only",
        projectSlug: slug,
      });
    }
  }
}

const totalDivergent = Object.values(tally).reduce((s, t) => s + t.oldOnly + t.thOnly, 0);
const summary = {
  generated_at: new Date().toISOString(),
  bundles_total: submissions.length,
  bundles_compared: bundlesCompared,
  bundles_errored: bundlesErrored,
  shared_checks: SHARED_CHECKS,
  divergent_decisions: totalDivergent,
  per_check: tally,
  divergence_examples: divergences.slice(0, args.examples),
  note: "Per-submission declaredPackages from projectSlug package.json (legacy parity).",
};

const outDir = path.join(args.outputDir, "shadow-compare-out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "shadow-compare-report.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

console.log(`\nShadow compare — legacy JS gate vs trailhead engine`);
console.log(
  `Bundles: ${bundlesCompared} compared, ${bundlesErrored} errored, of ${submissions.length} total\n`,
);
console.log(
  `${"check".padEnd(24)} ${"agree".padStart(6)} ${"old-only".padStart(9)} ${"th-only".padStart(8)}`,
);
console.log("-".repeat(50));
for (const code of SHARED_CHECKS) {
  const t = tally[code];
  console.log(
    `${code.padEnd(24)} ${String(t.agree).padStart(6)} ${String(t.oldOnly).padStart(9)} ${String(t.thOnly).padStart(8)}`,
  );
}
console.log("-".repeat(50));
console.log(`Total divergent decisions: ${totalDivergent}`);
console.log(`Report: ${path.join(outDir, "shadow-compare-report.json")}\n`);

process.exit(totalDivergent > 0 ? 1 : 0);
