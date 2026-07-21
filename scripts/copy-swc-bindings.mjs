#!/usr/bin/env node
/**
 * Copy @swc/core platform native bindings into dist/ after ncc build.
 * Uses npm pack for cross-platform binaries when the host OS cannot install them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distArg = process.argv[2];
const distDir = distArg ? path.resolve(distArg) : path.join(root, "dist");
const swcRoot = path.join(root, "node_modules", "@swc");

if (!fs.existsSync(distDir)) {
  console.error(`copy-swc-bindings: dist directory not found: ${distDir}`);
  process.exit(1);
}

const pkgJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const swcVersion = (pkgJson.dependencies?.["@swc/core"] ?? "1.15.40").replace(
  /^[^\d]*/,
  "",
);

/** GitHub Actions (linux-gnu) + common dev platforms. */
const BINDING_PACKAGES = [
  "@swc/core-linux-x64-gnu",
  "@swc/core-linux-x64-musl",
  "@swc/core-darwin-arm64",
  "@swc/core-darwin-x64",
  "@swc/core-win32-x64-msvc",
];

function copyNodeFile(src, destName) {
  const dest = path.join(distDir, destName);
  if (
    fs.existsSync(dest) &&
    fs.statSync(src).size === fs.statSync(dest).size &&
    fs.readFileSync(src).equals(fs.readFileSync(dest))
  ) {
    console.log(`copy-swc-bindings: ${destName} (already current)`);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log(`copy-swc-bindings: ${destName}`);
}

function fetchNodeBinary(pkg) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swc-pack-"));
  try {
    execSync(`npm pack ${pkg}@${swcVersion}`, { cwd: tmp, stdio: "pipe" });
    const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) return null;
    execSync(`tar -xzf ${JSON.stringify(tgz)}`, { cwd: tmp, stdio: "pipe" });
    const pkgDir = path.join(tmp, "package");
    const nodeFile = fs.readdirSync(pkgDir).find((f) => f.endsWith(".node"));
    if (!nodeFile) return null;
    const src = path.join(pkgDir, nodeFile);
    const dest = path.join(distDir, nodeFile);
    fs.copyFileSync(src, dest);
    console.log(`copy-swc-bindings: ${nodeFile} (from ${pkg})`);
    return nodeFile;
  } catch (error) {
    console.warn(`copy-swc-bindings: could not fetch ${pkg}: ${error}`);
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let copied = 0;
for (const pkg of BINDING_PACKAGES) {
  const shortName = pkg.replace("@swc/", "");
  const localDir = path.join(swcRoot, shortName);

  if (fs.existsSync(localDir)) {
    const nodeFile = fs.readdirSync(localDir).find((f) => f.endsWith(".node"));
    if (nodeFile) {
      copyNodeFile(path.join(localDir, nodeFile), nodeFile);
      copied += 1;
      continue;
    }
  }

  if (fetchNodeBinary(pkg)) copied += 1;
}

if (copied === 0) {
  console.warn("copy-swc-bindings: no swc.*.node binaries copied");
  process.exit(1);
}
