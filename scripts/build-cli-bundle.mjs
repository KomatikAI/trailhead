#!/usr/bin/env node
/**
 * Build a self-contained Trailhead CLI bundle (ncc + vendored @swc/core bindings).
 * Output: cli/dist/index.js (+ swc.*.node) — no consumer npm install of @swc/core.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cliDist = path.join(root, "cli", "dist");

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

fs.rmSync(cliDist, { recursive: true, force: true });
fs.mkdirSync(cliDist, { recursive: true });

run("node scripts/copy-shared-src.mjs cli");
run("npx ncc build cli/src/index.ts -o cli/dist --source-map --license licenses.txt");
run("node scripts/copy-swc-bindings.mjs cli/dist");

// ncc emits stray .d.ts trees; npm tarball should ship the runnable bundle only.
const keepNames = new Set([
  "index.js",
  "index.js.map",
  "licenses.txt",
  "sourcemap-register.js",
]);
for (const name of fs.readdirSync(cliDist)) {
  if (name.startsWith("swc.") && name.endsWith(".node")) continue;
  if (keepNames.has(name)) continue;
  fs.rmSync(path.join(cliDist, name), { recursive: true, force: true });
}

if (!fs.existsSync(path.join(cliDist, "index.js"))) {
  console.error("build-cli-bundle: cli/dist/index.js missing after ncc build");
  process.exit(1);
}

console.log("build-cli-bundle: ok → cli/dist/index.js");
