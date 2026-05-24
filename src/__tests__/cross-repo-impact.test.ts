import { describe, it, expect, vi } from "vitest";
import {
  collectCrossRepoWebhookDeliveries,
  detectCrossRepoImpact,
  formatCrossRepoImpactSection,
  loadConsumerRegistryFile,
  mergeConsumerRegistries,
  parseConsumerRegistry,
  sendCrossRepoImpactWebhooks,
} from "../cross-repo-impact.js";
import type { RepoConfig } from "../types.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const baseConfig = {
  schema_version: 2 as const,
  gate: { mode: "release-ready" as const, check_name: "Trailhead — Release Ready" },
  contexts: [],
  sensitivity: { high: [], medium: [], low: [] },
  weights: {},
  profiles: [],
  thresholds: {},
  ignore: [],
  freeze: [],
  environments: {},
  services: {
    api: {
      paths: ["src/api/**"],
      contracts: ["src/api/contracts/**"],
      consumers: ["web", { repo: "KomatikAI/frontend", branch: "main" }],
      notify_webhook: "https://hooks.example.com/api-contract",
    },
  },
  consumer_registry: {
    web: { repo: "KomatikAI/web-app", branch: "main" },
  },
  security: {
    severity_threshold: "warning",
    block_on_critical: true,
    ignore_rules: [],
  },
  escalation: {
    targets: [],
    acknowledge_sla_minutes: 30,
    resolve_sla_minutes: 240,
  },
  policies: {
    agent_prs: {
      enabled: false,
      required_approvals: 1,
      require_code_owner_approval: false,
      code_owner_reviewers: [],
      sensitive_paths: [],
      strict_on_unknown_provenance: true,
    },
    session_correlation: { enabled: false, threshold: 3, mode: "warn" as const, window_minutes: 60 },
    ci_integrity: { enabled: true, mode: "block" },
    workflow_security: {
      enabled: true,
      mode: "block",
      allow_unpinned_actions: [],
    },
    prompt_injection: { enabled: true, mode: "warn" },
    supply_chain: { enabled: true, mode: "warn" as const, force_score_on_critical: 80 },
    pr_scope: {
      enabled: true,
      max_files: 50,
      max_changes: 2000,
      mode: "warn",
      require_plan_for_agent_prs: false,
    },
    duplicate_logic: { enabled: true, mode: "warn" },
    cross_repo_impact: { enabled: true, mode: "warn" as const },
  },
} satisfies RepoConfig;

describe("detectCrossRepoImpact", () => {
  it("resolves alias and external repo consumers when contracts change", () => {
    const impact = detectCrossRepoImpact(
      [{ filename: "src/api/contracts/users.json" }],
      baseConfig,
    );

    expect(impact.factor).not.toBeNull();
    expect(impact.services).toHaveLength(1);
    expect(impact.services[0]?.consumers.map((c) => c.repo)).toEqual([
      "KomatikAI/web-app",
      "KomatikAI/frontend",
    ]);
    expect(impact.affectedConsumers).toContain("KomatikAI/web-app@main");
    expect(impact.affectedConsumers).toContain("KomatikAI/frontend@main");
  });

  it("merges external registry file entries", () => {
    const impact = detectCrossRepoImpact(
      [{ filename: "src/api/contracts/users.json" }],
      {
        ...baseConfig,
        services: {
          api: {
            paths: [],
            contracts: ["src/api/contracts/**"],
            consumers: ["worker"],
          },
        },
        consumer_registry: {},
      },
      { worker: { repo: "KomatikAI/worker" } },
    );

    expect(impact.affectedConsumers).toContain("KomatikAI/worker");
  });

  it("returns empty result when policy disabled", () => {
    const impact = detectCrossRepoImpact([{ filename: "src/api/contracts/users.json" }], {
      ...baseConfig,
      policies: {
        ...baseConfig.policies,
        cross_repo_impact: { enabled: false, mode: "warn" },
      },
    });
    expect(impact.factor).toBeNull();
  });
});

describe("consumer registry file", () => {
  it("loads JSON registry from disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "th-registry-"));
    const file = path.join(dir, "consumers.json");
    fs.writeFileSync(
      file,
      JSON.stringify({ mobile: { repo: "KomatikAI/mobile", branch: "main" } }),
    );
    const registry = loadConsumerRegistryFile(file);
    expect(registry?.mobile?.repo).toBe("KomatikAI/mobile");
  });

  it("parses inline registry records", () => {
    const registry = parseConsumerRegistry({
      api: { repo: "KomatikAI/api-client" },
    });
    expect(mergeConsumerRegistries(registry).api.repo).toBe("KomatikAI/api-client");
  });
});

describe("satellite webhooks", () => {
  it("collects service and consumer webhook URLs", () => {
    const impact = detectCrossRepoImpact(
      [{ filename: "src/api/contracts/users.json" }],
      baseConfig,
    );
    const deliveries = collectCrossRepoWebhookDeliveries(impact);
    expect(
      deliveries.some((d) => d.url === "https://hooks.example.com/api-contract"),
    ).toBe(true);
  });

  it("posts contract_change payloads fail-open", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    const impact = detectCrossRepoImpact(
      [{ filename: "src/api/contracts/users.json" }],
      baseConfig,
    );

    await expect(
      sendCrossRepoImpactWebhooks(
        impact,
        { repoId: "KomatikAI/trailhead", commitSha: "abc1234", prNumber: 42 },
        fetchMock,
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("formatCrossRepoImpactSection", () => {
  it("lists downstream repos in markdown", () => {
    const impact = detectCrossRepoImpact(
      [{ filename: "src/api/contracts/users.json" }],
      baseConfig,
    );
    const section = formatCrossRepoImpactSection(impact).join("\n");
    expect(section).toContain("### Cross-Repo Impact");
    expect(section).toContain("KomatikAI/frontend@main");
    expect(section).toContain("Satellite webhook configured");
  });
});
