#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = mkdtempSync(path.join(root, ".trailhead-simulate-build-"));

try {
  const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
  execFileSync(
    process.execPath,
    [tsc, "--project", path.join(root, "tsconfig.simulate.json"), "--outDir", outputDir],
    { cwd: root, stdio: "inherit" },
  );
  writeFileSync(
    path.join(outputDir, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}\n`,
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [path.join(outputDir, "scripts", "simulate.mjs"), ...process.argv.slice(2)],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 2;
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
