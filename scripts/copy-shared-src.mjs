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

if (targetName !== "app" && targetName !== "mcp") {
  console.error("Usage: node scripts/copy-shared-src.mjs <app|mcp>");
  process.exit(1);
}

const sharedFiles = [
  "risk-engine.ts",
  "types.ts",
  "context-matcher.ts",
  "release-ready.ts",
  "ci-core.ts",
];

const targetDir = path.join(root, targetName, "src");
fs.mkdirSync(targetDir, { recursive: true });

for (const file of sharedFiles) {
  fs.copyFileSync(path.join(root, "src", file), path.join(targetDir, file));
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

console.log(`Copied ${sharedFiles.length} shared modules to ${targetName}/src/`);
