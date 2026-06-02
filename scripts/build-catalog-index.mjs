#!/usr/bin/env node
/**
 * Build the org catalog index for the contract_integrity detector (ADR-010).
 *
 * Emits { version, generated, entities[] } — every Backstage entity
 * `metadata.name` published across the org's catalog-info.yaml files. Point
 * `.trailhead.yml` `submission.contract_integrity.catalog_index_path` at the
 * output so cross-repo contract references (a satellite consuming an API another
 * repo publishes) resolve instead of being reported as unverified.
 *
 * Usage:
 *   # GitHub org (needs an authenticated `gh`):
 *   node scripts/build-catalog-index.mjs --org KomatikAI -o catalog-index.json
 *
 *   # Local checkout(s) — scan dirs for catalog-info.yaml:
 *   node scripts/build-catalog-index.mjs --root ../ -o catalog-index.json
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

function parseArgs(argv) {
  const args = { roots: [], org: null, out: "catalog-index.json", generated: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.roots.push(argv[++i]);
    else if (a === "--org") args.org = argv[++i];
    else if (a === "-o" || a === "--out") args.out = argv[++i];
    else if (a === "--generated") args.generated = argv[++i];
  }
  return args;
}

/** Collect every entity metadata.name from a multi-doc catalog-info YAML string. */
function entityNames(content) {
  const names = [];
  try {
    yaml.loadAll(content, (doc) => {
      const name = doc && typeof doc === "object" ? doc?.metadata?.name : null;
      if (typeof name === "string" && name.length > 0) names.push(name);
    });
  } catch {
    // skip malformed catalog files
  }
  return names;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function fromOrg(org) {
  const names = new Set();
  const repos = gh([
    "api",
    `orgs/${org}/repos?per_page=100`,
    "--paginate",
    "-q",
    ".[].name",
  ])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const repo of repos) {
    for (const file of ["catalog-info.yaml", "catalog-info.yml"]) {
      try {
        const b64 = gh(["api", `repos/${org}/${repo}/contents/${file}`, "-q", ".content"]);
        const content = Buffer.from(b64, "base64").toString("utf8");
        for (const n of entityNames(content)) names.add(n);
        break; // found the catalog file for this repo
      } catch {
        // no catalog-info at this path — try next / skip repo
      }
    }
  }
  return names;
}

function fromRoots(roots) {
  const names = new Set();
  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git") continue;
      const full = path.join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(full);
      else if (entry === "catalog-info.yaml" || entry === "catalog-info.yml") {
        for (const n of entityNames(readFileSync(full, "utf8"))) names.add(n);
      }
    }
  };
  for (const root of roots) visit(root);
  return names;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.org && args.roots.length === 0) {
    console.error("Provide --org <name> or --root <dir> (repeatable).");
    process.exit(2);
  }
  const names = args.org ? fromOrg(args.org) : fromRoots(args.roots);
  const entities = [...names].sort();
  const index = {
    version: 1,
    // pass --generated <iso> for reproducible output; default empty (stamp in CI)
    generated: args.generated,
    source: args.org ? `org:${args.org}` : `roots:${args.roots.join(",")}`,
    entities,
  };
  writeFileSync(args.out, JSON.stringify(index, null, 2) + "\n");
  console.error(`Wrote ${entities.length} entities → ${args.out}`);
}

main();
