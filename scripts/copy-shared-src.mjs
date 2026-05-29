#!/usr/bin/env node
/**
 * Copies shared Trailhead source modules into app/ or mcp/ before tsc.
 * Usage: node scripts/copy-shared-src.mjs <app|mcp>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const targetName = process.argv[2];

if (
  targetName !== "app" &&
  targetName !== "mcp" &&
  targetName !== "cloud" &&
  targetName !== "cli"
) {
  console.error("Usage: node scripts/copy-shared-src.mjs <app|mcp|cloud|cli>");
  process.exit(1);
}

const sharedFiles = [
  "risk-engine.ts",
  "types.ts",
  "context-matcher.ts",
  "release-ready.ts",
  "ci-core.ts",
  "ci-manifest.ts",
  "ci-external.ts",
  "ci-status-store.ts",
  "config-core.ts",
  "deployment-gate.ts",
  "remediation.ts",
  "loop-bookkeeping.ts",
  "submission-remediation.ts",
  "submission-engine.ts",
  "remediation-lanes.ts",
  "trailhead-events.ts",
];

const adapterFiles = ["gitlab.ts", "circleci.ts"];

const cloudOnlyFiles = ["feedback-core.ts"];

const cliFiles = [
  "config-core.ts",
  "types.ts",
  "ci-core.ts",
  "ci-manifest.ts",
  "release-ready.ts",
  "doctor.ts",
];

const filesToCopy =
  targetName === "cloud"
    ? cloudOnlyFiles
    : targetName === "cli"
      ? cliFiles
      : targetName === "mcp"
        ? [...sharedFiles, ...cloudOnlyFiles]
        : sharedFiles;

const targetDir =
  targetName === "cli"
    ? path.join(root, targetName, "src", "shared")
    : path.join(root, targetName, "src");
fs.mkdirSync(targetDir, { recursive: true });

for (const file of filesToCopy) {
  fs.copyFileSync(path.join(root, "src", file), path.join(targetDir, file));
}

if (targetName === "app" || targetName === "mcp") {
  const adaptersDir = path.join(targetDir, "ci-adapters");
  fs.mkdirSync(adaptersDir, { recursive: true });
  for (const file of adapterFiles) {
    fs.copyFileSync(
      path.join(root, "src/ci-adapters", file),
      path.join(adaptersDir, file),
    );
  }
}

if (targetName === "mcp") {
  const adaptersDir = path.join(targetDir, "adapters");
  fs.mkdirSync(adaptersDir, { recursive: true });
  for (const f of [
    "types",
    "registry",
    "vercel",
    "supabase",
    "aws-ecs",
    "fly-io",
    "cloudflare",
    "index",
  ]) {
    fs.copyFileSync(
      path.join(root, "src/adapters", `${f}.ts`),
      path.join(adaptersDir, `${f}.ts`),
    );
  }
}

console.log(
  `Copied ${filesToCopy.length} shared modules to ${targetDir.replace(root + path.sep, "")}/`,
);
