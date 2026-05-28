#!/usr/bin/env node
// security-guard — Trailhead's autonomous-merge backstop.
//
// WHY THIS EXISTS
// As the fleet moves to autonomous PR authoring + soak-then-merge, a poisoned-
// but-plausible change must not be able to merge with no human in the loop. The
// motivating case (2026-05-27): a fleet message relayed a *real* CVE
// (CVE-2026-48710, Starlette host-header auth bypass) but the actual instruction
// was "run the BadHost scanner against both services" — i.e. the malice is in the
// REMEDIATION ACTION, not the claim. A "is this a real CVE?" check passes; the
// danger is the action. So this guard gates ACTION CLASSES in the diff, not the
// premise.
//
// CONTRACT
// Scans the PR diff + PR body + commit messages and classifies findings as BLOCK
// or WARN. Exits non-zero when any BLOCK finding is present, UNLESS the PR carries
// the `security-reviewed` label (a human's explicit sign-off — the override path,
// no admin-merge required). This script is meant to back the single required
// status check `security-guard` (mirrors the `ci-gate` keystone pattern), so a
// non-zero exit keeps the PR un-mergeable until a human clears it.
//
// Zero dependencies (Node 24, ESM). Reads GitHub context from $GITHUB_EVENT_PATH.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// ── Tunables ───────────────────────────────────────────────────────────────

// Packages whose version is load-bearing for the running fleet. A bump here is
// never a routine change — it gets a human even if everything else looks benign.
// (litellm:4000 is the fleet front-door; a bad starlette/uvicorn pin has blacked
// out the whole cron fleet before.) Keep this list short and intentional.
const FLEET_CRITICAL = [
  "starlette",
  "uvicorn",
  "fastapi",
  "litellm",
  "vllm",
  "gunicorn",
  "anthropic",
  "openai",
];

// Hosts we expect to see in build/CI scripts. Anything outside this is surfaced
// (WARN) so a reviewer notices a new exfil/download target. Not exhaustive auth —
// just a nudge toward "why is this calling a new domain?".
const OUTBOUND_ALLOWLIST = [
  "github.com",
  "githubusercontent.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "api.github.com",
  "registry.npmjs.org",
  "npmjs.com",
  "pypi.org",
  "files.pythonhosted.org",
  "nodejs.org",
  "deb.debian.org",
  "security.debian.org",
  "archive.ubuntu.com",
  "ppa.launchpadcontent.net",
  "ghcr.io",
  "docker.io",
  "registry-1.docker.io",
  "auth.docker.io",
  "proxy.golang.org",
  "sum.golang.org",
  "crates.io",
  "static.crates.io",
  "rubygems.org",
  "astral.sh",
  "osv.dev",
  "nvd.nist.gov",
];

const DEP_FILE = [
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)npm-shrinkwrap\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)requirements[^/]*\.txt$/,
  /(^|\/)pyproject\.toml$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Pipfile(\.lock)?$/,
  /(^|\/)uv\.lock$/,
  /(^|\/)go\.(mod|sum)$/,
  /(^|\/)Cargo\.(toml|lock)$/,
  /(^|\/)Gemfile(\.lock)?$/,
  /(^|\/)composer\.(json|lock)$/,
];

const WORKFLOW_FILE = [
  /^\.github\/workflows\/.+\.ya?ml$/,
  /^\.github\/actions\//,
  /(^|\/)action\.ya?ml$/,
];

// Fetch-and-execute: download something and run it in one breath. Never auto.
const FETCH_EXEC = [
  /\b(curl|wget)\b[^|\n]*\|[^\n]*\b(sh|bash|zsh|dash|python[0-9.]*|node|ruby|perl)\b/i,
  /\b(bash|sh|zsh|dash)\b[^\n]*<\(\s*(curl|wget)\b/i,
  /\b(sh|bash|zsh)\b\s+-c\s+["']?\$\((curl|wget)\b/i,
  /\beval\b[^\n]*\$\(\s*(curl|wget)\b/i,
  /\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|[^\n]*\b(iex|Invoke-Expression)\b/i,
  /\bInvoke-Expression\b[^\n]*\b(DownloadString|iwr|irm|Invoke-WebRequest)\b/i,
  /\bbase64\b[^\n]*(-d|--decode|-D)\b[^\n]*\|[^\n]*\b(sh|bash|zsh|python)\b/i,
];

// Signals a PR was driven by external security content (the today-case). Cited
// CVE/advisory IDs or urgency/"run the scanner" phrasing → a human must look.
const ADVISORY = [
  /\bCVE-\d{4}-\d{3,7}\b/i,
  /\bGHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}\b/i,
  /\bPYSEC-\d{4}-\d+\b/i,
  /\bpatch immediately\b/i,
  /\brun (the )?[\w-]+ scanner\b/i,
  /\b(remote code execution|auth(?:entication)? bypass)\b/i,
];

// ── Context ──────────────────────────────────────────────────────────────────

function loadEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
}

const event = loadEvent();
const pr = event.pull_request ?? {};
const baseRef = pr.base?.ref || process.env.SECURITY_GUARD_BASE || "dev";
const labels = (pr.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const reviewed = labels.includes("security-reviewed");
const prBody = pr.body || "";
const prTitle = pr.title || "";

// Diff against the merge-base so we only judge what THIS PR introduces.
let range = "HEAD";
const mergeBase = git(["merge-base", `origin/${baseRef}`, "HEAD"]).trim();
if (mergeBase) range = `${mergeBase}..HEAD`;

const changedFiles = git(["diff", "--name-only", range])
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const addedLines = [];
{
  // --unified=0 → only changed hunks; keep '+' adds, drop the '+++' file headers.
  const diff = git(["diff", "--unified=0", range]);
  let currentFile = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) currentFile = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.push({ file: currentFile, text: line.slice(1) });
    }
  }
}
const commitMsgs = mergeBase ? git(["log", "--format=%s%n%b", `${mergeBase}..HEAD`]) : "";

// ── Rules ────────────────────────────────────────────────────────────────────

const findings = [];
const add = (level, rule, detail, file) => findings.push({ level, rule, detail, file });
const matchAny = (res, s) => res.some((re) => re.test(s));

// 1. Fetch-and-execute in added lines — BLOCK.
//    Skip this file: its rule definitions literally contain `curl|…|sh` patterns
//    and would otherwise match themselves.
const SELF = "scripts/security-guard.mjs";
for (const { file, text } of addedLines) {
  if (file.endsWith(SELF)) continue;
  if (matchAny(FETCH_EXEC, text)) {
    add(
      "BLOCK",
      "fetch-and-execute",
      `download-and-run pattern: \`${text.trim().slice(0, 120)}\``,
      file,
    );
  }
}

// 2. CI / workflow / action changes — BLOCK (a malicious workflow can exfiltrate
//    secrets; CI changes always get a human before autonomous merge).
for (const f of changedFiles) {
  if (WORKFLOW_FILE.some((re) => re.test(f))) {
    add("BLOCK", "ci-workflow-change", "changes CI/workflow/action definitions", f);
  }
}

// 3. External-advisory-driven PR — BLOCK. The diff may be legit; the point is a
//    human must confirm the remediation isn't itself the attack.
const advisoryHaystack = `${prTitle}\n${prBody}\n${commitMsgs}`;
if (matchAny(ADVISORY, advisoryHaystack)) {
  const hit = ADVISORY.find((re) => re.test(advisoryHaystack));
  add(
    "BLOCK",
    "external-advisory-cited",
    `PR text cites a security advisory/urgency signal (\`${(advisoryHaystack.match(hit) || [""])[0]}\`) — verify the fix is not itself a malicious action`,
  );
}

// 4. Dependency / lockfile changes. WARN by default; BLOCK when a fleet-critical
//    package is touched OR the PR is advisory-driven (supply-chain + urgency).
const depFiles = changedFiles.filter((f) => DEP_FILE.some((re) => re.test(f)));
if (depFiles.length) {
  // Only look inside the dependency manifests themselves — not arbitrary source
  // (e.g. this guard's own FLEET_CRITICAL list would otherwise self-match).
  const depFileSet = new Set(depFiles);
  const critHits = new Set();
  for (const { file, text } of addedLines) {
    if (!depFileSet.has(file)) continue;
    for (const name of FLEET_CRITICAL) {
      const re = new RegExp(`["'\\s/]${name}["'\\s@=<>:~^]|^${name}\\b`, "i");
      if (re.test(text)) critHits.add(name);
    }
  }
  if (critHits.size) {
    add(
      "BLOCK",
      "fleet-critical-dependency",
      `touches fleet-critical package(s): ${[...critHits].join(", ")} — coordinated, compat-checked upgrade only`,
      depFiles.join(", "),
    );
  } else if (matchAny(ADVISORY, advisoryHaystack)) {
    add(
      "BLOCK",
      "dependency-change",
      `dependency/lockfile change on an advisory-driven PR — confirm provenance`,
      depFiles.join(", "),
    );
  } else {
    add(
      "WARN",
      "dependency-change",
      `dependency/lockfile change (${depFiles.length} file(s)) — verify provenance`,
      depFiles.join(", "),
    );
  }
}

// 5. New outbound domains in added lines — WARN (noticeable, not blocking).
const urlRe = /https?:\/\/([a-z0-9.-]+)/gi;
const seenHosts = new Set();
for (const { file, text } of addedLines) {
  for (const m of text.matchAll(urlRe)) {
    const host = m[1].toLowerCase().replace(/\.$/, "");
    if (seenHosts.has(host)) continue;
    const ok = OUTBOUND_ALLOWLIST.some((a) => host === a || host.endsWith(`.${a}`));
    if (!ok) {
      seenHosts.add(host);
      add(
        "WARN",
        "new-outbound-domain",
        `references non-allowlisted host \`${host}\``,
        file,
      );
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const blocks = findings.filter((f) => f.level === "BLOCK");
const warns = findings.filter((f) => f.level === "WARN");

const lines = [];
lines.push("# 🛡️ security-guard");
lines.push("");
lines.push(
  `Base \`${baseRef}\` · ${changedFiles.length} changed file(s) · ${blocks.length} block · ${warns.length} warn`,
);
lines.push("");

const render = (f) =>
  `- **${f.rule}** — ${f.detail}${f.file ? ` _(in \`${f.file}\`)_` : ""}`;

if (blocks.length) {
  lines.push("## ❌ Blocking — human review required");
  for (const f of blocks) {
    lines.push(render(f));
    console.log(`::error file=${f.file || "PR"}::security-guard[${f.rule}] ${f.detail}`);
  }
  lines.push("");
}
if (warns.length) {
  lines.push("## ⚠️ Advisory");
  for (const f of warns) {
    lines.push(render(f));
    console.log(
      `::warning file=${f.file || "PR"}::security-guard[${f.rule}] ${f.detail}`,
    );
  }
  lines.push("");
}
if (!findings.length) lines.push("✅ No high-risk action patterns detected.");

let exitCode = 0;
if (blocks.length && reviewed) {
  lines.push("");
  lines.push(
    "> ✅ **Overridden by `security-reviewed` label** — a human has signed off. Blocking findings downgraded to advisory.",
  );
} else if (blocks.length) {
  lines.push("");
  lines.push(
    "> A maintainer must verify the change is safe, then add the **`security-reviewed`** label to clear this check. Autonomous merge is blocked until then.",
  );
  exitCode = 1;
}

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    execFileSync("bash", ["-c", `cat >> "$GITHUB_STEP_SUMMARY"`], { input: report });
  } catch {
    /* summary is best-effort */
  }
}

process.exit(exitCode);
