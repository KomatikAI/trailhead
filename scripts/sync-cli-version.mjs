#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const version = process.env.npm_package_version;
if (!version) {
  console.error("sync-cli-version: npm_package_version is not set");
  process.exit(1);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("sync-cli-version: npm_execpath is not set");
  process.exit(1);
}

execFileSync(
  process.execPath,
  [
    npmCli,
    "--prefix",
    "cli",
    "version",
    version,
    "--no-git-tag-version",
    "--allow-same-version",
  ],
  { stdio: "inherit" },
);
execFileSync("git", ["add", "cli/package.json", "cli/package-lock.json"], {
  stdio: "inherit",
});
