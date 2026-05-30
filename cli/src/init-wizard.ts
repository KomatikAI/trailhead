import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type AudienceId,
  type InitProfile,
  parseCheckList,
  profileFromAudience,
  writeInitArtifacts,
} from "./generators.js";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function print(msg: string) {
  process.stdout.write(msg + "\n");
}

function ask(
  rl: readline.Interface,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` ${DIM}(${defaultValue})${RESET}` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function askYN(
  rl: readline.Interface,
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`  ${question} ${DIM}(${hint})${RESET}: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

export function parseInitPresetArg(args: string[]): AudienceId | undefined {
  const idx = args.indexOf("--preset");
  if (idx >= 0 && args[idx + 1]) {
    const value = args[idx + 1] as AudienceId;
    if (["solo", "team", "agent", "ops"].includes(value)) return value;
    process.stderr.write(`Unknown preset "${value}". Use: solo, team, agent, ops\n`);
    process.exit(2);
  }
  return undefined;
}

async function runCustomWizard(
  rl: readline.Interface,
  profile: InitProfile,
): Promise<InitProfile> {
  print(`${BOLD}Gate mode${RESET}`);
  print(`  ${DIM}1) release-ready — single required check (CI + risk)${RESET}`);
  print(`  ${DIM}2) advisory — report only, never blocks${RESET}`);
  print(`  ${DIM}3) risk-only — v3 behavior (risk score only)${RESET}`);
  const modeInput = await ask(rl, `${CYAN}Choose gate mode${RESET}`, "1");
  profile.gateMode =
    modeInput === "2" ? "advisory" : modeInput === "3" ? "risk-only" : "release-ready";

  if (profile.gateMode !== "risk-only") {
    print(`\n${BOLD}Branch model${RESET}`);
    print(`  ${DIM}1) main-only — PRs target main/master${RESET}`);
    print(`  ${DIM}2) progressive — dev → staging → main promotion${RESET}`);
    const branchInput = await ask(rl, `${CYAN}Choose branch model${RESET}`, "1");
    profile.branchModel = branchInput === "2" ? "progressive" : "main-only";

    const featureChecksInput = await ask(
      rl,
      `${CYAN}Feature PR required checks${RESET} (comma-separated)`,
      "CI, Build",
    );
    profile.featureChecks = parseCheckList(featureChecksInput, profile.featureChecks);

    const promotionChecksInput = await ask(
      rl,
      `${CYAN}Promotion PR required checks${RESET} (comma-separated)`,
      "CI, Build, Playwright",
    );
    profile.promotionChecks = parseCheckList(
      promotionChecksInput,
      profile.promotionChecks,
    );
  }

  const riskStr = await ask(
    rl,
    `${CYAN}Risk threshold${RESET} (block above this score, 0-100)`,
    String(profile.riskThreshold),
  );
  profile.riskThreshold = Math.max(
    0,
    Math.min(100, parseInt(riskStr, 10) || profile.riskThreshold),
  );

  const warnStr = await ask(
    rl,
    `${CYAN}Warn threshold${RESET} (warn above this score)`,
    String(profile.warnThreshold),
  );
  profile.warnThreshold = Math.max(
    0,
    Math.min(100, parseInt(warnStr, 10) || profile.warnThreshold),
  );

  print(
    `\n${BOLD}Sensitive file patterns${RESET} ${DIM}(files that carry extra risk weight)${RESET}`,
  );
  const highInput = await ask(rl, "High-sensitivity globs (comma-separated)", "");
  profile.highSensitivity = highInput
    ? highInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const medInput = await ask(rl, "Medium-sensitivity globs (comma-separated)", "");
  profile.mediumSensitivity = medInput
    ? medInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const wantEnvs = await askYN(rl, "Configure environment-specific thresholds?", false);
  if (wantEnvs) {
    const envsInput = await ask(
      rl,
      "Environment names (comma-separated)",
      "production,staging",
    );
    const envNames = envsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    profile.environments = [];
    for (const name of envNames) {
      const r = await ask(rl, `  ${name} risk threshold`, String(profile.riskThreshold));
      const w = await ask(rl, `  ${name} warn threshold`, String(parseInt(r, 10) - 15));
      profile.environments.push({
        name,
        risk: parseInt(r, 10) || profile.riskThreshold,
        warn: parseInt(w, 10) || profile.warnThreshold - 15,
      });
    }
    profile.environment = envNames[0] ?? "";
  }

  const wantServices = await askYN(rl, "Configure service boundaries (monorepo)?", false);
  if (wantServices) {
    const svcInput = await ask(rl, "Service names (comma-separated)", "api,web");
    const svcNames = svcInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    profile.services = [];
    for (const name of svcNames) {
      const p = await ask(rl, `  ${name} path globs (comma-separated)`, `src/${name}/**`);
      const e = await ask(rl, `  ${name} environment`, "");
      profile.services.push({
        name,
        paths: p
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        env: e,
      });
    }
  }

  const healthInput = await ask(
    rl,
    `${CYAN}Health check URLs${RESET} (comma-separated, or blank)`,
    "",
  );
  profile.healthCheckUrls = healthInput
    ? healthInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  profile.doraMetrics = await askYN(rl, `${CYAN}Enable DORA-5 metrics?${RESET}`, false);
  if (profile.doraMetrics) {
    profile.doraEnvironment = await ask(
      rl,
      `${CYAN}DORA environment filter${RESET} (blank for all)`,
      profile.environment || "",
    );
  }

  profile.securityGate = await askYN(
    rl,
    `${CYAN}Enable security alerts gate?${RESET} ${DIM}(requires Code Scanning)${RESET}`,
    true,
  );

  const wantCanary = await askYN(rl, "Configure deployment outcome webhooks?", false);
  profile.canaryType = wantCanary
    ? await ask(rl, "Webhook type (vercel/generic)", "vercel")
    : "";

  profile.otelEndpoint = await ask(
    rl,
    `${CYAN}OTLP endpoint${RESET} (blank to skip)`,
    "",
  );

  const wantStore = await askYN(
    rl,
    `${CYAN}POST evaluations to a trend-store URL?${RESET}`,
    false,
  );
  if (wantStore) {
    profile.evaluationStoreUrl = await ask(rl, "Store URL", "");
    profile.storeSecretName = await ask(
      rl,
      "GitHub Actions secret name for Bearer token",
      "INTERNAL_API_SECRET",
    );
    profile.supabaseFallback = await askYN(
      rl,
      "Include Supabase direct-insert fallback env vars?",
      false,
    );
  }

  const wantFreeze = await askYN(rl, "Configure a release freeze window?", false);
  if (wantFreeze) {
    const daysInput = await ask(rl, "Freeze days (e.g. friday,saturday)", "friday");
    profile.freezeDays = daysInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const hourStr = await ask(rl, "Freeze after hour (0-23, UTC)", "15");
    profile.freezeAfterHour = Math.max(0, Math.min(23, parseInt(hourStr, 10) || 15));
  }

  profile.submissionEnabled = await askYN(
    rl,
    "Enable submission gate (Gate 1) for agent PRs?",
    false,
  );
  profile.submissionGate = profile.submissionEnabled;
  if (profile.submissionEnabled) {
    profile.remediationEnabled = await askYN(rl, "Enable remediation payloads?", true);
    profile.agentPolicies = await askYN(rl, "Enable agent PR policies?", true);
    profile.agentBrief = await askYN(rl, "Collapsed agent brief in PR comments?", true);
  }

  return profile;
}

async function runAudienceWizard(
  rl: readline.Interface,
  audience: AudienceId,
): Promise<InitProfile> {
  const profile = profileFromAudience(audience);

  switch (audience) {
    case "solo": {
      const checks = await ask(
        rl,
        `${CYAN}Required CI check names${RESET} (comma-separated)`,
        profile.promotionChecks.join(", "),
      );
      profile.promotionChecks = parseCheckList(checks, profile.promotionChecks);
      break;
    }
    case "team": {
      const feature = await ask(
        rl,
        `${CYAN}Feature PR required checks${RESET} (comma-separated)`,
        profile.featureChecks.join(", "),
      );
      profile.featureChecks = parseCheckList(feature, profile.featureChecks);
      const promo = await ask(
        rl,
        `${CYAN}Promotion PR required checks${RESET} (comma-separated)`,
        profile.promotionChecks.join(", "),
      );
      profile.promotionChecks = parseCheckList(promo, profile.promotionChecks);
      break;
    }
    case "agent": {
      const checks = await ask(
        rl,
        `${CYAN}Required CI check names${RESET} (comma-separated)`,
        profile.promotionChecks.join(", "),
      );
      profile.promotionChecks = parseCheckList(checks, profile.promotionChecks);
      break;
    }
    case "ops": {
      const checks = await ask(
        rl,
        `${CYAN}Required CI check names${RESET} (comma-separated)`,
        profile.promotionChecks.join(", "),
      );
      profile.promotionChecks = parseCheckList(checks, profile.promotionChecks);
      const healthInput = await ask(
        rl,
        `${CYAN}Production health check URLs${RESET} (comma-separated, recommended)`,
        "",
      );
      profile.healthCheckUrls = healthInput
        ? healthInput
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const keepFreeze = await askYN(
        rl,
        "Keep default freeze (Friday–Saturday after 15:00 UTC)?",
        true,
      );
      if (!keepFreeze) {
        profile.freezeDays = [];
        profile.freezeAfterHour = null;
      }
      profile.doraMetrics = await askYN(rl, "Enable DORA-5 metrics in workflow?", true);
      break;
    }
    default:
      return runCustomWizard(rl, profile);
  }

  return profile;
}

export async function runInitWizard(args: string[]): Promise<number> {
  const preset = parseInitPresetArg(args);
  const cwd = process.cwd();

  if (preset) {
    const profile = profileFromAudience(preset);
    writeInitArtifacts(profile, cwd);
    print(
      `\n${GREEN}✓${RESET} Wrote .trailhead.yml and workflow from preset: ${BOLD}${preset}${RESET}\n`,
    );
    return 0;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  print(`\n${BOLD}${GREEN}Trailhead v4 Setup Wizard${RESET}\n`);
  print(`${DIM}Creates .trailhead.yml and .github/workflows/trailhead.yml${RESET}\n`);

  print(`${BOLD}What are you protecting?${RESET}`);
  print(`  ${DIM}1) Solo / small team — one repo, Release Ready beyond CI green${RESET}`);
  print(
    `  ${DIM}2) Platform / eng lead — standard policy across repos (dev→staging→main)${RESET}`,
  );
  print(`  ${DIM}3) AI-authored PRs — submission gate before merge${RESET}`);
  print(`  ${DIM}4) Production ops — freeze windows, health probes, DORA${RESET}`);
  print(`  ${DIM}5) Custom — full advanced wizard (all options)${RESET}`);

  const audienceInput = await ask(rl, `${CYAN}Choose setup path${RESET}`, "1");
  const audience: AudienceId =
    audienceInput === "2"
      ? "team"
      : audienceInput === "3"
        ? "agent"
        : audienceInput === "4"
          ? "ops"
          : audienceInput === "5"
            ? "custom"
            : "solo";

  const profile =
    audience === "custom"
      ? await runCustomWizard(rl, profileFromAudience("custom"))
      : await runAudienceWizard(rl, audience);

  rl.close();

  print(`\n${BOLD}Writing files...${RESET}\n`);
  writeInitArtifacts(profile, cwd);

  const configPath = path.join(cwd, ".trailhead.yml");
  print(`  ${GREEN}✓${RESET} .trailhead.yml`);

  const workflowPath = path.join(cwd, ".github", "workflows", "trailhead.yml");
  if (fs.existsSync(workflowPath)) {
    print(
      `  ${YELLOW}⚠${RESET} .github/workflows/trailhead.yml already exists — wrote trailhead-generated.yml`,
    );
  } else {
    print(`  ${GREEN}✓${RESET} .github/workflows/trailhead.yml`);
  }

  print(`
${BOLD}${GREEN}Setup complete!${RESET}

${BOLD}Preset:${RESET} ${profile.audience} · See presets/${profile.audience === "agent" ? "agent-guard" : profile.audience}.yml

${BOLD}Next steps:${RESET}
  1. Review the generated files
  2. Commit and push
  3. Require ${BOLD}Trailhead — Release Ready${RESET} in branch protection
  4. trailhead doctor --offline

${DIM}Docs: docs/getting-started.md · https://github.com/KomatikAI/trailhead${RESET}
`);

  return 0;
}
