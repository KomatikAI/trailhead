#!/usr/bin/env node

import * as fs from "node:fs";
import { runInitWizard } from "./init-wizard.js";
import { runDoctorCommand } from "./run-doctor.js";
import {
  runSubmissionGate,
  submissionGateShouldBlock,
} from "./shared/submission-engine.js";

const CLI_VERSION = "4.4.4";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function print(msg: string) {
  process.stdout.write(msg + "\n");
}

function asAddedPatch(content: string): string {
  const lines = content.split("\n");
  return `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
}

function runValidateSubmission(args: string[]): number {
  const inputIdx = args.indexOf("--input");
  let raw: string;
  try {
    raw =
      inputIdx >= 0 && args[inputIdx + 1]
        ? fs.readFileSync(args[inputIdx + 1] as string, "utf-8")
        : fs.readFileSync(0, "utf-8");
  } catch {
    process.stderr.write("validate-submission: could not read input\n");
    return 2;
  }

  let payload: {
    files?: Array<{ filename: string; content?: string; patch?: string }>;
    komatikInstance?: boolean;
    komatik_instance?: boolean;
    repoPaths?: string[];
    repo_paths?: string[];
    declaredPackages?: string[];
    declared_packages?: string[];
    mode?: "warn" | "block";
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("validate-submission: input is not valid JSON\n");
    return 2;
  }

  const mode = payload.mode ?? "block";
  const files = (payload.files ?? []).map((f) =>
    typeof f.content === "string" && !f.patch
      ? { ...f, patch: asAddedPatch(f.content) }
      : f,
  );
  const checks = runSubmissionGate({
    files,
    komatikInstance: payload.komatikInstance ?? payload.komatik_instance ?? false,
    repoPaths: payload.repoPaths ?? payload.repo_paths,
    declaredPackages: payload.declaredPackages ?? payload.declared_packages,
    mode,
  });

  const shouldBlock = submissionGateShouldBlock(checks, mode);
  const decision = shouldBlock
    ? "block"
    : checks.some((c) => c.severity === "warn")
      ? "warn"
      : "allow";

  process.stdout.write(
    JSON.stringify({ decision, shouldBlock, mode, checks }, null, 2) + "\n",
  );
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "doctor") {
    const code = await runDoctorCommand(args.slice(1));
    process.exit(code);
  }

  if (command === "validate-submission") {
    const code = runValidateSubmission(args.slice(1));
    process.exit(code);
  }

  if (command === "init") {
    const code = await runInitWizard(args.slice(1));
    process.exit(code);
  }

  print(`
${BOLD}${GREEN}Trailhead CLI v${CLI_VERSION}${RESET}

${BOLD}Usage:${RESET}
  npx @komatikai/trailhead init [--preset solo|team|agent|ops]
  npx @komatikai/trailhead doctor
  npx @komatikai/trailhead validate-submission

${BOLD}Presets:${RESET} solo · team · agent · ops — see presets/ or docs/getting-started.md

${BOLD}Learn more:${RESET}
  https://github.com/KomatikAI/trailhead
`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
