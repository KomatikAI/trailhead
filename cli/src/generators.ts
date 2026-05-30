import fs from "node:fs";
import path from "node:path";

export type GateModeOption = "release-ready" | "risk-only" | "advisory";
export type BranchModel = "main-only" | "progressive";
export type AudienceId = "solo" | "team" | "agent" | "ops" | "custom";

export function parseCheckList(input: string, fallback: string[]): string[] {
  const list = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
}

const AUDIENCE_COMMENTS: Record<AudienceId, string> = {
  solo: "# Preset: solo — one repo, Release Ready beyond CI green",
  team: "# Preset: team — progressive dev → staging → main",
  agent: "# Preset: agent-guard — AI-authored PR safety (submission gate)",
  ops: "# Preset: ops — freeze windows, health probes, DORA",
  custom: "# Trailhead v4 configuration",
};

export function generateTrailheadYml(options: {
  highSensitivity: string[];
  mediumSensitivity: string[];
  riskThreshold: number;
  warnThreshold: number;
  freezeDays: string[];
  freezeAfterHour: number | null;
  environments: Array<{ name: string; risk: number; warn: number }>;
  services: Array<{ name: string; paths: string[]; env: string }>;
  securityGate: boolean;
  canaryType: string;
}): string {
  const lines: string[] = [
    "# Trailhead v3 configuration",
    "# https://github.com/KomatikAI/trailhead",
    "",
  ];

  if (options.highSensitivity.length > 0 || options.mediumSensitivity.length > 0) {
    lines.push("sensitivity:");
    if (options.highSensitivity.length > 0) {
      lines.push("  high:");
      for (const p of options.highSensitivity) lines.push(`    - "${p}"`);
    }
    if (options.mediumSensitivity.length > 0) {
      lines.push("  medium:");
      for (const p of options.mediumSensitivity) lines.push(`    - "${p}"`);
    }
    lines.push("");
  }

  lines.push("thresholds:");
  lines.push(`  risk: ${options.riskThreshold}`);
  lines.push(`  warn: ${options.warnThreshold}`);
  lines.push("");

  if (options.environments.length > 0) {
    lines.push("environments:");
    for (const env of options.environments) {
      lines.push(`  ${env.name}:`);
      lines.push(`    risk: ${env.risk}`);
      lines.push(`    warn: ${env.warn}`);
    }
    lines.push("");
  }

  if (options.services.length > 0) {
    lines.push("services:");
    for (const svc of options.services) {
      lines.push(`  ${svc.name}:`);
      lines.push("    paths:");
      for (const p of svc.paths) lines.push(`      - "${p}"`);
      if (svc.env) lines.push(`    environment: ${svc.env}`);
    }
    lines.push("");
  }

  if (options.securityGate) {
    lines.push("security:");
    lines.push("  severity_threshold: warning");
    lines.push("  block_on_critical: true");
    lines.push("");
  }

  if (options.canaryType) {
    lines.push("canary:");
    lines.push(`  webhook_type: ${options.canaryType}`);
    lines.push("");
  }

  if (options.freezeDays.length > 0 && options.freezeAfterHour !== null) {
    lines.push("freeze:");
    lines.push("  - days:");
    for (const d of options.freezeDays) lines.push(`      - "${d}"`);
    lines.push(`    afterHour: ${options.freezeAfterHour}`);
    lines.push(`    message: "No deploys during freeze window"`);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

export interface TrailheadYmlV2Options {
  audience?: AudienceId;
  gateMode: GateModeOption;
  branchModel: BranchModel;
  riskThreshold: number;
  warnThreshold: number;
  featureRisk: number;
  featureWarn: number;
  stagingRisk: number;
  stagingWarn: number;
  productionRisk: number;
  productionWarn: number;
  featureChecks: string[];
  promotionChecks: string[];
  highSensitivity: string[];
  mediumSensitivity: string[];
  freezeDays: string[];
  freezeAfterHour: number | null;
  environments: Array<{ name: string; risk: number; warn: number }>;
  services: Array<{ name: string; paths: string[]; env: string }>;
  securityGate: boolean;
  canaryType: string;
  mainContextInheritsGlobalThresholds?: boolean;
  submissionEnabled?: boolean;
  remediationEnabled?: boolean;
  agentPolicies?: boolean;
  agentBrief?: boolean;
}

export function generateTrailheadYmlV2(options: TrailheadYmlV2Options): string {
  const audience = options.audience ?? "custom";
  const lines: string[] = [
    AUDIENCE_COMMENTS[audience],
    "# https://github.com/KomatikAI/trailhead",
    "",
    "schema_version: 2",
    "",
    "gate:",
    `  mode: ${options.gateMode}`,
  ];
  if (options.agentBrief) {
    lines.push("  agent_brief: collapsed");
  }
  lines.push(
    "",
    "thresholds:",
    `  risk: ${options.riskThreshold}`,
    `  warn: ${options.warnThreshold}`,
    "",
  );

  if (options.gateMode !== "risk-only") {
    lines.push("contexts:");
    if (options.branchModel === "progressive") {
      lines.push("  - name: feature");
      lines.push("    match:");
      lines.push("      base_branch:");
      lines.push("        - dev");
      lines.push("        - develop");
      lines.push("    environment: dev");
      lines.push("    thresholds:");
      lines.push(`      risk: ${options.featureRisk}`);
      lines.push(`      warn: ${options.featureWarn}`);
      lines.push("    ci:");
      lines.push("      required_checks:");
      for (const c of options.featureChecks) lines.push(`        - ${c}`);
      lines.push("      missing_required: skip");
      lines.push("");
      lines.push("  - name: staging-promotion");
      lines.push("    match:");
      lines.push("      base_branch:");
      lines.push("        - staging");
      lines.push("    environment: staging");
      lines.push("    thresholds:");
      lines.push(`      risk: ${options.stagingRisk}`);
      lines.push(`      warn: ${options.stagingWarn}`);
      lines.push("    ci:");
      lines.push("      required_checks:");
      for (const c of options.promotionChecks) lines.push(`        - ${c}`);
      lines.push("      missing_required: fail");
      lines.push("");
      lines.push("  - name: production-promotion");
      lines.push("    match:");
      lines.push("      base_branch:");
      lines.push("        - main");
      lines.push("        - master");
      lines.push("    environment: production");
      lines.push("    thresholds:");
      lines.push(`      risk: ${options.productionRisk}`);
      lines.push(`      warn: ${options.productionWarn}`);
      lines.push("    ci:");
      lines.push("      required_checks:");
      for (const c of options.promotionChecks) lines.push(`        - ${c}`);
      lines.push("      missing_required: fail");
      lines.push("");
    } else {
      lines.push("  - name: main");
      lines.push("    match:");
      lines.push("      base_branch:");
      lines.push("        - main");
      lines.push("        - master");
      lines.push("    environment: production");
      if (!options.mainContextInheritsGlobalThresholds) {
        lines.push("    thresholds:");
        lines.push(`      risk: ${options.productionRisk}`);
        lines.push(`      warn: ${options.productionWarn}`);
      }
      lines.push("    ci:");
      lines.push("      required_checks:");
      for (const c of options.promotionChecks) lines.push(`        - ${c}`);
      lines.push("      missing_required: fail");
      lines.push("");
    }
  }

  if (options.highSensitivity.length > 0 || options.mediumSensitivity.length > 0) {
    lines.push("sensitivity:");
    if (options.highSensitivity.length > 0) {
      lines.push("  high:");
      for (const p of options.highSensitivity) lines.push(`    - "${p}"`);
    }
    if (options.mediumSensitivity.length > 0) {
      lines.push("  medium:");
      for (const p of options.mediumSensitivity) lines.push(`    - "${p}"`);
    }
    lines.push("");
  }

  if (options.environments.length > 0) {
    lines.push("environments:");
    for (const env of options.environments) {
      lines.push(`  ${env.name}:`);
      lines.push(`    risk: ${env.risk}`);
      lines.push(`    warn: ${env.warn}`);
    }
    lines.push("");
  }

  if (options.services.length > 0) {
    lines.push("services:");
    for (const svc of options.services) {
      lines.push(`  ${svc.name}:`);
      lines.push("    paths:");
      for (const p of svc.paths) lines.push(`      - "${p}"`);
      if (svc.env) lines.push(`    environment: ${svc.env}`);
    }
    lines.push("");
  }

  if (options.agentPolicies) {
    lines.push("policies:");
    lines.push("  agent_prs:");
    lines.push("    enabled: true");
    lines.push(`    risk_threshold: ${Math.max(0, options.warnThreshold)}`);
    lines.push("    strict_on_unknown_provenance: true");
    lines.push("    require_code_owner_approval: false");
    lines.push("  ci_integrity:");
    lines.push("    mode: block");
    lines.push("  workflow_security:");
    lines.push("    mode: block");
    lines.push("  prompt_injection:");
    lines.push("    mode: block");
    lines.push("  pr_scope:");
    lines.push("    mode: warn");
    lines.push("    max_files: 30");
    lines.push("    max_changes: 1500");
    lines.push("");
  }

  if (options.remediationEnabled) {
    lines.push("remediation:");
    lines.push("  enabled: true");
    lines.push("  max_loop_rounds: 5");
    lines.push("");
  }

  if (options.submissionEnabled) {
    lines.push("submission:");
    lines.push("  enabled: true");
    lines.push("  mode: block");
    lines.push("");
  }

  if (options.securityGate) {
    lines.push("security:");
    lines.push("  severity_threshold: warning");
    lines.push("  block_on_critical: true");
    lines.push("");
  }

  if (options.canaryType) {
    lines.push("canary:");
    lines.push(`  webhook_type: ${options.canaryType}`);
    lines.push("");
  }

  if (options.freezeDays.length > 0 && options.freezeAfterHour !== null) {
    lines.push("freeze:");
    lines.push("  - days:");
    for (const d of options.freezeDays) lines.push(`      - "${d}"`);
    lines.push(`    afterHour: ${options.freezeAfterHour}`);
    lines.push(`    message: "No deploys during freeze window"`);
    lines.push("");
  }

  if (options.agentPolicies) {
    lines.push("override:");
    lines.push("  enabled: true");
    lines.push("  max_per_week: 5");
    lines.push("");
    lines.push("tuning:");
    lines.push("  auto_downgrade: true");
    lines.push("  fp_threshold: 0.15");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

export interface WorkflowYmlOptions {
  riskThreshold: number;
  healthCheckUrls: string[];
  doraMetrics: boolean;
  doraEnvironment: string;
  otelEndpoint: string;
  evaluationStoreUrl: string;
  storeSecretName: string;
  supabaseFallback: boolean;
  securityGate: boolean;
  environment: string;
  gateMode: GateModeOption;
  waitForChecks: boolean;
  submissionGate?: boolean;
}

export function generateWorkflowYml(options: WorkflowYmlOptions): string {
  const lines: string[] = [
    "name: Trailhead",
    "",
    "on:",
    "  pull_request:",
    "    types: [opened, synchronize, reopened]",
    "",
    "permissions:",
    "  contents: read",
    "  pull-requests: write",
    "  checks: write",
    "  security-events: read",
    "",
    "jobs:",
    "  trailhead:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "",
    "      - uses: KomatikAI/trailhead@v4",
    "        id: gate",
    "        with:",
  ];

  if (options.gateMode !== "risk-only") {
    lines.push(`          gate-mode: "${options.gateMode}"`);
    if (options.waitForChecks) {
      lines.push('          wait-for-checks: "true"');
      lines.push('          wait-timeout-minutes: "30"');
    }
  }

  lines.push(`          risk-threshold: "${options.riskThreshold}"`);

  if (options.submissionGate) {
    lines.push('          submission-gate: "true"');
  }

  if (options.healthCheckUrls.length > 0) {
    lines.push(`          health-check-urls: "${options.healthCheckUrls.join(",")}"`);
  }

  if (options.doraMetrics) {
    lines.push('          dora-metrics: "true"');
  }

  if (options.doraEnvironment) {
    lines.push(`          dora-environment: "${options.doraEnvironment}"`);
  }

  if (options.environment) {
    lines.push(`          environment: "${options.environment}"`);
  }

  if (!options.securityGate) {
    lines.push('          security-gate: "false"');
  }

  if (options.otelEndpoint) {
    lines.push(`          otel-endpoint: "${options.otelEndpoint}"`);
  }

  if (options.evaluationStoreUrl) {
    lines.push(`          evaluation-store-url: "${options.evaluationStoreUrl}"`);
    if (options.storeSecretName) {
      lines.push(
        `          evaluation-store-secret: \${{ secrets.${options.storeSecretName} }}`,
      );
    }
  }

  const envLines: string[] = [];
  if (options.evaluationStoreUrl && options.storeSecretName) {
    envLines.push(
      `          EVALUATION_STORE_SECRET: \${{ secrets.${options.storeSecretName} }}`,
    );
  }
  if (options.supabaseFallback) {
    envLines.push(`          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}`);
    envLines.push(
      `          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}`,
    );
  }

  if (envLines.length > 0) {
    lines.push("        env:");
    for (const el of envLines) lines.push(el);
  }

  if (options.doraMetrics) {
    lines.push("");
    lines.push("      - name: DORA outputs");
    lines.push("        if: always()");
    lines.push("        run: |");
    lines.push('          echo "dora-rating:  ${{ steps.gate.outputs.dora-rating }}"');
    lines.push(
      '          echo "dora-freq:    ${{ steps.gate.outputs.dora-deployment-frequency }}"',
    );
    lines.push(
      '          echo "dora-cfr:     ${{ steps.gate.outputs.dora-change-failure-rate }}"',
    );
    lines.push('          echo "dora-lead:    ${{ steps.gate.outputs.dora-lead-time }}"');
    lines.push('          echo "dora-fdrt:    ${{ steps.gate.outputs.dora-fdrt }}"');
    lines.push(
      '          echo "dora-rework:  ${{ steps.gate.outputs.dora-rework-rate }}"',
    );
  }

  lines.push("");
  return lines.join("\n") + "\n";
}

export interface InitProfile {
  audience: AudienceId;
  gateMode: GateModeOption;
  branchModel: BranchModel;
  riskThreshold: number;
  warnThreshold: number;
  featureChecks: string[];
  promotionChecks: string[];
  highSensitivity: string[];
  mediumSensitivity: string[];
  freezeDays: string[];
  freezeAfterHour: number | null;
  environments: Array<{ name: string; risk: number; warn: number }>;
  services: Array<{ name: string; paths: string[]; env: string }>;
  securityGate: boolean;
  canaryType: string;
  healthCheckUrls: string[];
  doraMetrics: boolean;
  doraEnvironment: string;
  otelEndpoint: string;
  evaluationStoreUrl: string;
  storeSecretName: string;
  supabaseFallback: boolean;
  environment: string;
  submissionGate: boolean;
  submissionEnabled: boolean;
  remediationEnabled: boolean;
  agentPolicies: boolean;
  agentBrief: boolean;
  mainContextInheritsGlobalThresholds: boolean;
}

export function profileFromAudience(audience: AudienceId): InitProfile {
  const base: InitProfile = {
    audience,
    gateMode: "release-ready",
    branchModel: "main-only",
    riskThreshold: 70,
    warnThreshold: 55,
    featureChecks: ["CI", "Build"],
    promotionChecks: ["CI", "Build"],
    highSensitivity: [],
    mediumSensitivity: [],
    freezeDays: [],
    freezeAfterHour: null,
    environments: [],
    services: [],
    securityGate: true,
    canaryType: "",
    healthCheckUrls: [],
    doraMetrics: false,
    doraEnvironment: "",
    otelEndpoint: "",
    evaluationStoreUrl: "",
    storeSecretName: "",
    supabaseFallback: false,
    environment: "",
    submissionGate: false,
    submissionEnabled: false,
    remediationEnabled: false,
    agentPolicies: false,
    agentBrief: false,
    mainContextInheritsGlobalThresholds: true,
  };

  switch (audience) {
    case "team":
      return {
        ...base,
        branchModel: "progressive",
        promotionChecks: ["CI", "Build", "Playwright"],
        mainContextInheritsGlobalThresholds: false,
      };
    case "agent":
      return {
        ...base,
        riskThreshold: 60,
        warnThreshold: 40,
        submissionGate: true,
        submissionEnabled: true,
        remediationEnabled: true,
        agentPolicies: true,
        agentBrief: true,
        mainContextInheritsGlobalThresholds: true,
      };
    case "ops":
      return {
        ...base,
        riskThreshold: 70,
        warnThreshold: 55,
        freezeDays: ["friday", "saturday"],
        freezeAfterHour: 15,
        canaryType: "generic",
        doraMetrics: true,
        environments: [
          { name: "production", risk: 65, warn: 50 },
          { name: "staging", risk: 75, warn: 55 },
        ],
        environment: "production",
        mainContextInheritsGlobalThresholds: false,
      };
    case "custom":
      return { ...base, mainContextInheritsGlobalThresholds: false };
    default:
      return base;
  }
}

export function writeInitArtifacts(profile: InitProfile, cwd = process.cwd()): void {
  const useV2 = profile.gateMode !== "risk-only";
  const configContent = useV2
    ? generateTrailheadYmlV2({
        audience: profile.audience,
        gateMode: profile.gateMode,
        branchModel: profile.branchModel,
        riskThreshold: profile.riskThreshold,
        warnThreshold: profile.warnThreshold,
        featureRisk: Math.min(100, profile.riskThreshold + 5),
        featureWarn: profile.warnThreshold,
        stagingRisk: Math.max(0, profile.riskThreshold - 5),
        stagingWarn: Math.max(0, profile.warnThreshold - 10),
        productionRisk: profile.mainContextInheritsGlobalThresholds
          ? profile.riskThreshold
          : Math.max(0, profile.riskThreshold - 10),
        productionWarn: profile.mainContextInheritsGlobalThresholds
          ? profile.warnThreshold
          : Math.max(0, profile.warnThreshold - 15),
        featureChecks: profile.featureChecks,
        promotionChecks: profile.promotionChecks,
        highSensitivity: profile.highSensitivity,
        mediumSensitivity: profile.mediumSensitivity,
        freezeDays: profile.freezeDays,
        freezeAfterHour: profile.freezeAfterHour,
        environments: profile.environments,
        services: profile.services,
        securityGate: profile.securityGate,
        canaryType: profile.canaryType,
        mainContextInheritsGlobalThresholds: profile.mainContextInheritsGlobalThresholds,
        submissionEnabled: profile.submissionEnabled,
        remediationEnabled: profile.remediationEnabled,
        agentPolicies: profile.agentPolicies,
        agentBrief: profile.agentBrief,
      })
    : generateTrailheadYml({
        highSensitivity: profile.highSensitivity,
        mediumSensitivity: profile.mediumSensitivity,
        riskThreshold: profile.riskThreshold,
        warnThreshold: profile.warnThreshold,
        freezeDays: profile.freezeDays,
        freezeAfterHour: profile.freezeAfterHour,
        environments: profile.environments,
        services: profile.services,
        securityGate: profile.securityGate,
        canaryType: profile.canaryType,
      });

  fs.writeFileSync(path.join(cwd, ".trailhead.yml"), configContent, "utf-8");

  const workflowDir = path.join(cwd, ".github", "workflows");
  fs.mkdirSync(workflowDir, { recursive: true });

  const workflowContent = generateWorkflowYml({
    riskThreshold: profile.riskThreshold,
    healthCheckUrls: profile.healthCheckUrls,
    doraMetrics: profile.doraMetrics,
    doraEnvironment: profile.doraEnvironment,
    otelEndpoint: profile.otelEndpoint,
    evaluationStoreUrl: profile.evaluationStoreUrl,
    storeSecretName: profile.storeSecretName,
    supabaseFallback: profile.supabaseFallback,
    securityGate: profile.securityGate,
    environment: profile.environment,
    gateMode: profile.gateMode,
    waitForChecks: profile.gateMode === "release-ready",
    submissionGate: profile.submissionGate,
  });

  const workflowPath = path.join(workflowDir, "trailhead.yml");
  if (fs.existsSync(workflowPath)) {
    fs.writeFileSync(
      path.join(workflowDir, "trailhead-generated.yml"),
      workflowContent,
      "utf-8",
    );
  } else {
    fs.writeFileSync(workflowPath, workflowContent, "utf-8");
  }
}
