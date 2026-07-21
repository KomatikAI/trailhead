/**
 * Local simulation of the Trailhead gate evaluation.
 *
 * Usage:
 *   node scripts/run-simulate.mjs
 *   node scripts/run-simulate.mjs --repo owner/repo --pr 123
 *   node scripts/run-simulate.mjs --health-url http://localhost:3000/health
 *   node scripts/run-simulate.mjs --threshold 50
 *
 * Environment variables (optional):
 *   GITHUB_TOKEN       — enables PR file fetching
 *   PR_NUMBER          — pull request number to evaluate
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function readEnv(primary: string, legacy?: string): string | undefined {
  return process.env[primary] ?? (legacy ? process.env[legacy] : undefined);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const val = args[i + 1];
    if (key && val) flags[key] = val;
  }
  return flags;
}

async function preparePullRequestEvent(input: {
  owner: string;
  repo: string;
  prNumber?: number;
  token?: string;
}): Promise<string | undefined> {
  if (!input.prNumber || !input.token) return undefined;

  const response = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch PR #${input.prNumber}: HTTP ${response.status}`);
  }

  const pullRequest = (await response.json()) as {
    number: number;
    body: string | null;
    labels: Array<{ name: string }>;
    head: { ref: string; sha: string };
    base: { ref: string };
  };
  const eventPayload = {
    pull_request: {
      number: pullRequest.number,
      body: pullRequest.body,
      labels: pullRequest.labels.map(({ name }) => ({ name })),
      head: { ref: pullRequest.head.ref, sha: pullRequest.head.sha },
      base: { ref: pullRequest.base.ref },
    },
  };
  const eventDir = await mkdtemp(path.join(os.tmpdir(), "trailhead-simulate-"));
  const eventPath = path.join(eventDir, "event.json");
  await writeFile(eventPath, JSON.stringify(eventPayload), "utf8");

  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_EVENT_NAME = "pull_request";
  process.env.GITHUB_REF = `refs/pull/${input.prNumber}/merge`;
  process.env.GITHUB_HEAD_REF = pullRequest.head.ref;
  process.env.GITHUB_BASE_REF = pullRequest.base.ref;
  process.env.GITHUB_SHA = pullRequest.head.sha;
  return eventDir;
}

async function main() {
  const flags = parseArgs();

  const targetRepo =
    flags["repo"] ??
    readEnv("TRAILHEAD_TARGET_REPO", "DEPLOYGUARD_TARGET_REPO") ??
    process.env.GITHUB_REPOSITORY ??
    "owner/repo";

  const [owner, repo] = targetRepo.split("/");
  const prNumber = flags["pr"]
    ? parseInt(flags["pr"], 10)
    : process.env.PR_NUMBER
      ? parseInt(process.env.PR_NUMBER, 10)
      : undefined;

  process.env.GITHUB_REPOSITORY = `${owner}/${repo}`;

  const eventDir = await preparePullRequestEvent({
    owner,
    repo,
    prNumber,
    token: process.env.GITHUB_TOKEN,
  });

  try {
    if (!process.env.GITHUB_ACTION) {
      process.env.GITHUB_ACTION = "local-simulate";
    }
    if (!process.env.GITHUB_EVENT_NAME) {
      process.env.GITHUB_EVENT_NAME = "push";
    }

    const { evaluateGate, formatGateReport, shouldBlockMerge } =
      await import("../src/gate.js");

    type TrailheadConfig = import("../src/types.js").TrailheadConfig;

    const config: TrailheadConfig = {
      apiKey: "",
      apiUrl: readEnv("TRAILHEAD_API_URL", "DEPLOYGUARD_API_URL") || "",
      githubToken: process.env.GITHUB_TOKEN,
      healthCheckUrls: (flags["health-url"] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      riskThreshold: parseInt(flags["threshold"] ?? "70", 10),
      failMode: "open",
      selfHeal: false,
      addRiskLabels: false,
      reviewersOnRisk: [],
      webhookEvents: [],
      evaluationStoreUrl: flags["store-url"] || undefined,
    };

    const commitSha =
      flags["sha"] ??
      process.env.GITHUB_SHA ??
      "0000000000000000000000000000000000000000";

    console.log("--- Trailhead Local Simulation ---");
    console.log(`  repo:      ${owner}/${repo}`);
    console.log(`  commit:    ${commitSha.substring(0, 7)}`);
    console.log(`  PR:        ${prNumber ?? "(none)"}`);
    console.log(`  threshold: ${config.riskThreshold}`);
    console.log(
      `  health:    ${config.healthCheckUrls.length > 0 ? config.healthCheckUrls.join(", ") : "(none)"}`,
    );
    console.log(`  token:     ${config.githubToken ? "***" : "(none)"}`);
    console.log();

    const evaluation = await evaluateGate(config, commitSha, prNumber);
    const report = formatGateReport(evaluation, config.riskThreshold);

    console.log(report);
    console.log();
    console.log(`Raw evaluation (${evaluation.evaluationMs}ms):`);
    console.log(JSON.stringify(evaluation, null, 2));

    process.exitCode = shouldBlockMerge(evaluation) ? 1 : 0;
  } finally {
    if (eventDir) await rm(eventDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exitCode = 2;
});
