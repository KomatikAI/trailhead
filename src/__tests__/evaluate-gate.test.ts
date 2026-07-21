import { vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { evaluateGate } from "../gate.js";
import type { TrailheadConfig } from "../types.js";
import * as evaluationHistory from "../evaluation-history.js";

vi.mock("../evaluation-history.js");

const githubMockState = vi.hoisted(() => ({
  pullRequest: {} as Record<string, unknown>,
  reviews: [] as Array<{ state: string; user?: { login?: string } }>,
  payload: {} as Record<string, unknown>,
  checkRuns: [] as Array<{
    name: string;
    status: string;
    conclusion: string | null;
    html_url?: string;
    details_url?: string;
  }>,
  checkRefs: [] as string[],
}));

vi.mock("@actions/core", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  getInput: vi.fn().mockReturnValue(""),
}));

vi.mock("@actions/github", () => ({
  context: {
    repo: { owner: "test-owner", repo: "test-repo" },
    sha: "abc1234567890",
    eventName: "pull_request",
    get payload() {
      return githubMockState.payload;
    },
  },
  getOctokit: (_token: string) => ({
    rest: {
      pulls: {
        listFiles: vi.fn().mockResolvedValue({
          data: [
            { filename: "src/app.ts", additions: 40, deletions: 10, changes: 50 },
            { filename: "src/utils.ts", additions: 20, deletions: 5, changes: 25 },
            {
              filename: "src/__tests__/app.test.ts",
              additions: 30,
              deletions: 0,
              changes: 30,
            },
          ],
        }),
        listCommits: vi.fn().mockResolvedValue({
          data: [
            {
              sha: "pr-commit-1",
              author: { login: "test-author" },
              commit: {
                message: "feat: add feature",
                author: { name: "Test Author", email: "test-author@example.com" },
              },
            },
          ],
        }),
        get: vi.fn().mockImplementation(async () => ({
          data: githubMockState.pullRequest,
        })),
        listReviews: vi.fn().mockImplementation(async () => ({
          data: githubMockState.reviews,
        })),
      },
      checks: {
        listForRef: vi.fn().mockImplementation(async ({ ref }: { ref: string }) => {
          githubMockState.checkRefs.push(ref);
          return { data: { check_runs: githubMockState.checkRuns } };
        }),
      },
      repos: {
        listCommits: vi.fn().mockResolvedValue({
          data: Array.from({ length: 12 }, (_, i) => ({
            sha: `commit-${i}`,
            author: { login: "test-author" },
            committer: { login: "test-author" },
            commit: {
              message: `commit ${i}`,
              author: { name: "Test Author", email: "test-author@example.com" },
            },
          })),
        }),
      },
    },
  }),
}));

function makeConfig(overrides: Partial<TrailheadConfig> = {}): TrailheadConfig {
  return {
    apiKey: "test-key",
    apiUrl: "https://api.example.com/deploy/evaluate",
    riskThreshold: 70,
    failMode: "open",
    selfHeal: false,
    addRiskLabels: true,
    reviewersOnRisk: [],
    webhookEvents: ["warn", "block"],
    healthCheckUrls: [],
    ...overrides,
  };
}

async function withLocalTrailheadConfig<T>(
  content: string,
  run: () => Promise<T>,
): Promise<T> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "trailhead-test-"));
  await writeFile(path.join(workspace, ".trailhead.yml"), content, "utf-8");
  vi.stubEnv("GITHUB_WORKSPACE", workspace);
  try {
    return await run();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

describe("evaluateGate (integration)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(evaluationHistory.fetchPreviousEvaluationForPr).mockResolvedValue(null);
    githubMockState.pullRequest = {
      user: { login: "test-author" },
      base: { ref: "main" },
      head: { ref: "feature/test", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = {
      pull_request: githubMockState.pullRequest,
    };
    githubMockState.reviews = [];
    githubMockState.checkRuns = [];
    githubMockState.checkRefs = [];
    // Avoid loading repo .trailhead.yml on CI (GITHUB_WORKSPACE is set there).
    vi.stubEnv("GITHUB_WORKSPACE", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns a complete GateEvaluation for a PR with no health URL", async () => {
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.id).toMatch(/^dg-abc1234-/);
    expect(result.repoId).toBe("test-owner/test-repo");
    expect(result.commitSha).toBe("abc1234567890");
    expect(result.prNumber).toBe(42);
    expect(result.healthScore).toBe(100);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(["allow", "warn", "block"]).toContain(result.gateDecision);
    expect(result.healthChecks).toHaveLength(0);
    expect(result.riskFactors.length).toBeGreaterThan(0);
    expect(result.evaluationMs).toBeGreaterThanOrEqual(0);
    expect(result.files).toEqual([
      "src/app.ts",
      "src/utils.ts",
      "src/__tests__/app.test.ts",
    ]);
  });

  it("fails release readiness when a required check fails on the PR head SHA", async () => {
    githubMockState.checkRuns = [
      {
        name: "Security audit",
        status: "completed",
        conclusion: "failure",
        html_url: "https://example.com/checks/security-audit",
      },
    ];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
gate:
  mode: release-ready
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    ci:
      required_checks: [Security audit]
      optional_checks: []
      missing_required: skip`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(githubMockState.checkRefs).toContain("pull-request-head-sha");
    expect(result.ci?.failedCount).toBe(1);
    expect(result.releaseReady).toBe(false);
    expect(result.releaseReadyReasons).toContain(
      'Required CI check "Security audit" is FAIL',
    );
  });

  it("includes author_history factor when token and PR are provided", async () => {
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);
    const authorFactor = result.riskFactors.find((f) => f.type === "author_history");
    expect(authorFactor).toBeDefined();
    expect(authorFactor!.score).toBeGreaterThanOrEqual(0);
  });

  it("adds PR provenance metadata to evaluation-json payload", async () => {
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);
    expect(result.pr?.provenance).toBeDefined();
    if (!result.pr?.provenance) {
      throw new Error("Expected provenance to be populated");
    }
    expect(result.pr.provenance.type).toBe("human");
    expect(result.pr.provenance.confidence).toBeGreaterThan(0);
  });

  it("includes trust profile metadata in evaluation payload", async () => {
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);
    expect(result.trust_profile).toBeDefined();
    expect(["baseline", "elevated", "strict"]).toContain(
      result.trust_profile?.strictness,
    );
    expect(typeof result.trust_profile?.reason).toBe("string");
  });

  it("populates remediation block and agentBriefMode in evaluation payload", async () => {
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);
    expect(result.remediation).toBeDefined();
    expect(result.remediation?.schema).toBe("trailhead.remediation.v1");
    expect(result.agentBriefMode).toBe("off");
  });

  it("respects custom warn threshold", async () => {
    const config = makeConfig({
      githubToken: "ghp_test",
      riskThreshold: 99,
      warnThreshold: 10,
    });
    const result = await evaluateGate(config, "abc1234567890", 42);
    expect(result.gateDecision).toBe("warn");
  });

  it("performs health check when URL is provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const config = makeConfig({
      githubToken: "ghp_test",
      healthCheckUrls: ["https://api.example.com/health"],
    });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.healthChecks).toHaveLength(1);
    expect(result.healthChecks[0].status).toBe("allow");
    expect(result.healthScore).toBe(100);
  });

  it("degrades health score for a 5xx health endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("server error", { status: 500 }));
    const config = makeConfig({
      githubToken: "ghp_test",
      healthCheckUrls: ["https://api.example.com/health"],
    });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.healthScore).toBe(0);
    expect(result.healthChecks[0].status).toBe("block");
  });

  it("returns zero risk when no PR number is provided", async () => {
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890");

    expect(result.riskScore).toBe(0);
    expect(result.riskFactors).toHaveLength(0);
    expect(result.prNumber).toBeUndefined();
  });

  it("returns zero risk when no token is provided (cannot fetch files)", async () => {
    const config = makeConfig();
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.riskScore).toBe(0);
    expect(result.riskFactors).toHaveLength(0);
  });

  it("blocks when risk exceeds threshold", async () => {
    const config = makeConfig({ githubToken: "ghp_test", riskThreshold: 5 });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.gateDecision).toBe("block");
  });

  it("allows when risk is well below threshold", async () => {
    const config = makeConfig({ githubToken: "ghp_test", riskThreshold: 99 });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.gateDecision).toBe("allow");
  });

  it("keeps agent PR threshold policy advisory in warn mode", async () => {
    githubMockState.pullRequest = {
      user: { login: "komatik-bot[bot]" },
      head: { ref: "agent/frontend-dev/polish-gate" },
    };

    const result = await withLocalTrailheadConfig(
      `schema_version: 1
policies:
  agent_prs:
    enabled: true
    mode: warn
    risk_threshold: 5`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", riskThreshold: 99 }),
          "abc1234567890",
          42,
        ),
    );

    expect(result.gateDecision).toBe("allow");
    expect(result.policyFindings).toContain(
      "Agent PR risk threshold would tighten from 99 to 5 (warn mode; not applied).",
    );
  });

  it("preserves fail-open on health check network failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const config = makeConfig({
      githubToken: "ghp_test",
      healthCheckUrls: ["https://dead-host.example.com/health"],
      riskThreshold: 99,
    });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.healthScore).toBe(50);
    expect(result.healthChecks[0].status).toBe("warn");
    expect(result.gateDecision).not.toBe("block");
  });

  it("enriches evaluation when gate API returns valid data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "api-enriched-id",
          reportUrl: "https://example.com/reports/123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.id).toBe("api-enriched-id");
    expect(result.reportUrl).toBe("https://example.com/reports/123");
  });

  it("falls back to local evaluation when gate API returns non-200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("server error", { status: 500 }));
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.id).toMatch(/^dg-abc1234-/);
    expect(result.reportUrl).toBeUndefined();
  });

  it("falls back to local evaluation when gate API returns invalid schema", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ riskScore: "not-a-number" }), {
        status: 200,
      }),
    );
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.id).toMatch(/^dg-abc1234-/);
  });

  it("falls back to local evaluation when gate API is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const config = makeConfig({ githubToken: "ghp_test" });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.id).toMatch(/^dg-abc1234-/);
  });

  it("performs multiple health checks when multiple URLs are provided", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("error", { status: 503 }));
    const config = makeConfig({
      githubToken: "ghp_test",
      healthCheckUrls: [
        "https://api.example.com/health",
        "https://api2.example.com/health",
      ],
    });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.healthChecks).toHaveLength(2);
    expect(result.healthChecks[0].status).toBe("allow");
    expect(result.healthChecks[1].status).toBe("block");
    expect(result.healthScore).toBe(50);
  });

  it("returns healthy when no health checks are configured", async () => {
    const config = makeConfig({ githubToken: "ghp_test", healthCheckUrls: [] });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.healthChecks).toHaveLength(0);
    expect(result.healthScore).toBe(100);
  });

  it("increments remediation loop_round from previous store evaluation", async () => {
    vi.mocked(evaluationHistory.fetchPreviousEvaluationForPr).mockResolvedValueOnce({
      id: "eval-prev",
      remediation: {
        schema: "trailhead.remediation.v1",
        release_ready: false,
        fixes: [],
        blocking_count: 1,
        warn_count: 0,
        advisory_count: 0,
        autofix_eligible_count: 0,
        loop_round: 1,
        max_loop_rounds: 3,
        fixes_resolved: [],
        fixes_introduced: [],
        next_action: "fix_and_retry",
      },
    });

    const config = makeConfig({
      githubToken: "ghp_test",
      evaluationStoreUrl: "https://api.trailhead.dev/v1/evaluations",
      trailheadApiKey: "th_test",
    });
    const result = await evaluateGate(config, "abc1234567890", 42);

    expect(result.remediation?.loop_round).toBe(2);
    expect(result.remediation?.previous_evaluation_id).toBe("eval-prev");
  });
});
