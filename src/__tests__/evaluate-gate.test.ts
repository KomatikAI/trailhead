import { vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";

import { evaluateGate, getResolvedCheckContract } from "../gate.js";
import { DEFAULT_ADVISORY_REASON } from "../input-relevance.js";
import { GateEvaluation } from "../types.js";
import type { TrailheadConfig } from "../types.js";
import * as evaluationHistory from "../evaluation-history.js";

vi.mock("../evaluation-history.js");

const githubMockState = vi.hoisted(() => ({
  pullRequest: {} as Record<string, unknown>,
  reviews: [] as Array<{
    id: number;
    state: string;
    submitted_at?: string | null;
    commit_id?: string | null;
    user?: { login?: string };
  }>,
  payload: {} as Record<string, unknown>,
  checkRuns: [] as Array<{
    name: string;
    status: string;
    conclusion: string | null;
    html_url?: string;
    details_url?: string;
  }>,
  checkRefs: [] as string[],
  listFileCalls: [] as number[],
  filePages: undefined as
    | Record<
        number,
        Array<{
          filename: string;
          additions: number;
          deletions: number;
          changes: number;
          patch?: string;
          status?: string;
        }>
      >
    | undefined,
  commitFiles: [] as Array<{
    filename: string;
    additions: number;
    deletions: number;
    changes: number;
  }>,
  routeContents: {} as Record<string, string>,
  contentRequests: [] as string[],
  closedPrs: [] as Array<{
    merged_at: string | null;
    user?: { login?: string };
  }>,
  overrideLabels: [] as string[],
  overrideComments: [] as Array<{
    body: string;
    author?: { login: string } | null;
  }>,
  overrideGraphqlError: null as Error | null,
  overrideGraphqlCalls: 0,
  eventName: "pull_request",
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
    get eventName() {
      return githubMockState.eventName;
    },
    get payload() {
      return githubMockState.payload;
    },
  },
  getOctokit: (_token: string) => ({
    graphql: vi.fn().mockImplementation(async () => {
      githubMockState.overrideGraphqlCalls += 1;
      if (githubMockState.overrideGraphqlError) {
        throw githubMockState.overrideGraphqlError;
      }
      return {
        repository: {
          pullRequest: {
            labels: {
              nodes: githubMockState.overrideLabels.map((name) => ({ name })),
            },
            comments: { nodes: githubMockState.overrideComments },
          },
        },
      };
    }),
    rest: {
      pulls: {
        listFiles: vi.fn().mockImplementation(async ({ page = 1 }) => {
          githubMockState.listFileCalls.push(page);
          const fallback = [
            { filename: "src/app.ts", additions: 40, deletions: 10, changes: 50 },
            { filename: "src/utils.ts", additions: 20, deletions: 5, changes: 25 },
            {
              filename: "src/__tests__/app.test.ts",
              additions: 30,
              deletions: 0,
              changes: 30,
            },
          ];
          return {
            data: githubMockState.filePages
              ? (githubMockState.filePages[page] ?? [])
              : page === 1
                ? fallback
                : [],
          };
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
        list: vi.fn().mockImplementation(async () => ({
          data: githubMockState.closedPrs,
        })),
      },
      checks: {
        listForRef: vi.fn().mockImplementation(async ({ ref }: { ref: string }) => {
          githubMockState.checkRefs.push(ref);
          return { data: { check_runs: githubMockState.checkRuns } };
        }),
      },
      repos: {
        getCommit: vi.fn().mockImplementation(async () => ({
          data: { files: githubMockState.commitFiles },
        })),
        getContent: vi.fn().mockImplementation(async ({ path }: { path: string }) => {
          githubMockState.contentRequests.push(path);
          const content = githubMockState.routeContents[path];
          if (content === undefined) throw new Error("not found");
          return {
            data: {
              type: "file",
              content: Buffer.from(content, "utf8").toString("base64"),
              encoding: "base64",
            },
          };
        }),
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
    githubMockState.listFileCalls = [];
    githubMockState.filePages = undefined;
    githubMockState.commitFiles = [];
    githubMockState.routeContents = {};
    githubMockState.contentRequests = [];
    githubMockState.closedPrs = [];
    githubMockState.overrideLabels = [];
    githubMockState.overrideComments = [];
    githubMockState.overrideGraphqlError = null;
    githubMockState.overrideGraphqlCalls = 0;
    githubMockState.eventName = "pull_request";
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

  it("carries the repo-configured custom check name into publication state", async () => {
    const result = await withLocalTrailheadConfig(
      `schema_version: 2
gate:
  mode: release-ready
  check_name: Custom Release Gate
`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.resolvedCheckName).toBe("Custom Release Gate");
    expect(getResolvedCheckContract()).toEqual({
      name: "Custom Release Gate",
      mode: "release-ready",
    });
  });

  it("lets the explicit check-name action input override repo config/defaults", async () => {
    const result = await withLocalTrailheadConfig(
      `schema_version: 2
gate:
  mode: release-ready
  check_name: Repo Release Gate
`,
      () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            securityGate: false,
            checkName: "Action Release Gate",
          }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.resolvedCheckName).toBe("Action Release Gate");
  });

  it("evaluates all 214 PR files across GitHub's 100-item pages", async () => {
    const files = Array.from({ length: 214 }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      additions: 1,
      deletions: 0,
      changes: 1,
    }));
    githubMockState.filePages = {
      1: files.slice(0, 100),
      2: files.slice(100, 200),
      3: files.slice(200),
    };
    githubMockState.commitFiles = files;

    const result = await evaluateGate(
      makeConfig({ githubToken: "ghp_test", securityGate: false }),
      "pull-request-head-sha",
      42,
    );

    expect(result.files).toHaveLength(214);
    expect(githubMockState.listFileCalls).toEqual([1, 2, 3]);
  });

  it("hydrates the current route body before evaluating configured auth helpers", async () => {
    const route = "apps/web/app/api/lodge/flow/route.ts";
    githubMockState.filePages = {
      1: [
        {
          filename: route,
          additions: 2,
          deletions: 0,
          changes: 2,
          status: "modified",
          patch:
            "@@ -20,1 +20,2 @@\n+export async function POST() {\n+  return Response.json({ ok: true });\n",
        },
      ],
    };
    githubMockState.routeContents[route] =
      "export async function POST() { const user = await getLodgeAuthUser(); return Response.json({ user }); }";

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
submission:
  enabled: true
  mode: block
  auth_route_helpers: [getLodgeAuthUser]
`,
      () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            submissionGate: true,
            securityGate: false,
          }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(githubMockState.contentRequests).toContain(route);
    expect(
      (result.submissionChecks ?? []).some((check) => check.code === "auth_route_auth"),
    ).toBe(false);
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

  it("retains an exempt promotion context threshold while still requiring approval", async () => {
    githubMockState.pullRequest = {
      user: { login: "komatik-bot[bot]" },
      base: { ref: "master" },
      head: { ref: "promotion/train-28", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = { pull_request: githubMockState.pullRequest };
    githubMockState.filePages = {
      1: [
        {
          filename: "supabase/migrations/20260824000000_release.sql",
          additions: 10,
          deletions: 0,
          changes: 10,
          status: "added",
        },
      ],
    };

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
contexts:
  - name: master-promotion
    match:
      head_branch: ["promotion/train-*"]
      base_branch: ["master"]
    thresholds:
      risk: 95
policies:
  agent_prs:
    enabled: true
    mode: block
    risk_threshold: 50
    risk_threshold_exempt_contexts: ["master-promotion"]
    required_approvals: 1
`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", riskThreshold: 70, securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.releaseBrief?.riskThreshold).toBe(95);
    expect(result.gateDecision).toBe("block");
    expect(result.policyFindings).toContain(
      "Sensitive-path agent PR requires 1 current-head approval(s) from reviewer(s) other than the PR author; found 0.",
    );
    expect(result.policyFindings).not.toContain(
      "Agent PR risk threshold tightened from 95 to 50.",
    );
    expect(result.releaseBrief?.findings).toContainEqual(
      expect.objectContaining({
        id: "agent_policy_notice/1",
        severity: "advisory",
        title:
          'Agent PR risk threshold exemption matched context "master-promotion"; retaining context threshold 95.',
      }),
    );
  });

  it("uses explicit backfill PR metadata instead of the triggering payload", async () => {
    githubMockState.pullRequest = {
      user: { login: "train-opener[bot]" },
      base: { ref: "master" },
      head: { ref: "promotion/train-28", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = {
      pull_request: {
        user: { login: "workflow-operator" },
        base: { ref: "dev" },
        head: { ref: "feature/unrelated", sha: "workflow-dispatch-sha" },
        labels: [{ name: "unrelated" }],
      },
    };
    githubMockState.filePages = {
      1: [
        {
          filename: "supabase/migrations/20260824000000_release.sql",
          additions: 10,
          deletions: 0,
          changes: 10,
          status: "added",
        },
      ],
    };
    githubMockState.reviews = [
      {
        id: 1,
        state: "APPROVED",
        submitted_at: "2026-08-24T10:00:00Z",
        commit_id: "pull-request-head-sha",
        user: { login: "train-opener[bot]" },
      },
    ];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
contexts:
  - name: master-promotion
    match:
      head_branch: ["promotion/train-*"]
      base_branch: ["master"]
      labels: ["release-train"]
    thresholds:
      risk: 95
policies:
  agent_prs:
    enabled: true
    mode: block
    risk_threshold: 50
    risk_threshold_exempt_contexts: ["master-promotion"]
    required_approvals: 1
  pr_scope:
    enabled: true
    mode: block
    max_files: 1
    max_changes: 1
    exempt:
      - head_branch: ["promotion/train-*"]
        base_branch: ["master"]
`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", riskThreshold: 70, securityGate: false }),
          "pull-request-head-sha",
          42,
          {
            baseRef: "master",
            headRef: "promotion/train-28",
            labels: ["release-train"],
            authorLogin: "train-opener[bot]",
          },
        ),
    );

    expect(result.releaseBrief?.riskThreshold).toBe(95);
    expect(result.gateDecision).toBe("block");
    expect(result.policyFindings).not.toContainEqual(
      expect.stringContaining("PR scope exceeds"),
    );
    expect(result.policyFindings).toContain(
      "Sensitive-path agent PR requires 1 current-head approval(s) from reviewer(s) other than the PR author; found 0.",
    );
  });

  it("still tightens the agent threshold when the matched context is not exempt", async () => {
    githubMockState.pullRequest = {
      user: { login: "komatik-bot[bot]" },
      base: { ref: "master" },
      head: { ref: "promotion/train-28", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = { pull_request: githubMockState.pullRequest };

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
contexts:
  - name: master-promotion
    match:
      head_branch: ["promotion/train-*"]
      base_branch: ["master"]
    thresholds:
      risk: 95
policies:
  agent_prs:
    enabled: true
    mode: block
    risk_threshold: 50
    risk_threshold_exempt_contexts: ["staging-promotion"]
    required_approvals: 0
`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.releaseBrief?.riskThreshold).toBe(50);
    expect(result.policyFindings).toContain(
      "Agent PR risk threshold tightened from 95 to 50.",
    );
  });

  it("counts only each reviewer's latest decisive current-head approval", async () => {
    githubMockState.pullRequest = {
      user: { login: "komatik-bot[bot]" },
      base: { ref: "master" },
      head: { ref: "promotion/train-28", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = { pull_request: githubMockState.pullRequest };
    githubMockState.filePages = {
      1: [
        {
          filename: "supabase/migrations/20260824000000_release.sql",
          additions: 10,
          deletions: 0,
          changes: 10,
          status: "added",
        },
      ],
    };
    githubMockState.reviews = [
      {
        id: 1,
        state: "APPROVED",
        submitted_at: "2026-08-24T10:00:00Z",
        commit_id: "pull-request-head-sha",
        user: { login: "cross-model-reviewer" },
      },
      {
        id: 2,
        state: "CHANGES_REQUESTED",
        submitted_at: "2026-08-24T10:05:00Z",
        commit_id: "pull-request-head-sha",
        user: { login: "cross-model-reviewer" },
      },
    ];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
policies:
  agent_prs:
    enabled: true
    mode: block
    required_approvals: 1
`,
      () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            riskThreshold: 100,
            securityGate: false,
          }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.policyFindings).toContain(
      "Sensitive-path agent PR requires 1 current-head approval(s) from reviewer(s) other than the PR author; found 0.",
    );
  });

  it("rejects dismissed, stale-head, and author approvals", async () => {
    githubMockState.pullRequest = {
      user: { login: "komatik-bot[bot]" },
      base: { ref: "master" },
      head: { ref: "promotion/train-28", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = { pull_request: githubMockState.pullRequest };
    githubMockState.filePages = {
      1: [
        {
          filename: "supabase/migrations/20260824000000_release.sql",
          additions: 10,
          deletions: 0,
          changes: 10,
          status: "added",
        },
      ],
    };
    githubMockState.reviews = [
      {
        id: 1,
        state: "DISMISSED",
        submitted_at: "2026-08-24T10:00:00Z",
        commit_id: "pull-request-head-sha",
        user: { login: "dismissed-reviewer" },
      },
      {
        id: 2,
        state: "APPROVED",
        submitted_at: "2026-08-24T10:01:00Z",
        commit_id: "old-head-sha",
        user: { login: "stale-reviewer" },
      },
      {
        id: 3,
        state: "APPROVED",
        submitted_at: "2026-08-24T10:02:00Z",
        commit_id: "pull-request-head-sha",
        user: { login: "Komatik-Bot[bot]" },
      },
    ];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
policies:
  agent_prs:
    enabled: true
    mode: block
    required_approvals: 1
`,
      () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            riskThreshold: 100,
            securityGate: false,
          }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.policyFindings).toContain(
      "Sensitive-path agent PR requires 1 current-head approval(s) from reviewer(s) other than the PR author; found 0.",
    );
  });

  it("accepts a distinct reviewer's approval on the current head", async () => {
    githubMockState.pullRequest = {
      user: { login: "komatik-bot[bot]" },
      base: { ref: "master" },
      head: { ref: "promotion/train-28", sha: "pull-request-head-sha" },
    };
    githubMockState.payload = { pull_request: githubMockState.pullRequest };
    githubMockState.filePages = {
      1: [
        {
          filename: "supabase/migrations/20260824000000_release.sql",
          additions: 10,
          deletions: 0,
          changes: 10,
          status: "added",
        },
      ],
    };
    githubMockState.reviews = [
      {
        id: 1,
        state: "APPROVED",
        submitted_at: "2026-08-24T10:00:00Z",
        commit_id: "pull-request-head-sha",
        user: { login: "Cross-Model-Reviewer" },
      },
    ];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
policies:
  agent_prs:
    enabled: true
    mode: block
    required_approvals: 1
    require_code_owner_approval: true
    code_owner_reviewers: ["cross-model-reviewer"]
`,
      () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            riskThreshold: 100,
            securityGate: false,
          }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.policyFindings ?? []).not.toContainEqual(
      expect.stringContaining("current-head approval"),
    );
    expect(result.policyFindings ?? []).not.toContainEqual(
      expect.stringContaining("code-owner approval"),
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

  // -------------------------------------------------------------------------
  // ADR-011 — Release Brief and input relevance
  // -------------------------------------------------------------------------

  it("Case B replay: an irrelevant required failure no longer blocks the release", async () => {
    githubMockState.checkRuns = [
      {
        name: "Deploy Edge Functions",
        status: "completed",
        conclusion: "failure",
        html_url: "https://example.com/checks/deploy-edge",
      },
      { name: "CI Gate", status: "completed", conclusion: "success" },
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
      required_checks: [CI Gate, Deploy Edge Functions]
      optional_checks: []
      missing_required: skip
    input_relevance:
      - pattern: "Deploy Edge Functions"
        disposition: irrelevant
        reason: "staging target unconfigured by design; see supabase-migrations.yml guard"`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.releaseReady).toBe(true);
    expect(result.releaseReadyReasons).toBeUndefined();
    expect(result.ci?.failedCount).toBe(0);

    const deployInput = result.releaseBrief?.inputs.find(
      (input) => input.checkName === "Deploy Edge Functions",
    );
    expect(deployInput).toEqual({
      checkName: "Deploy Edge Functions",
      status: "fail",
      disposition: "irrelevant",
      reason: "staging target unconfigured by design; see supabase-migrations.yml guard",
    });
  });

  it("blocks the same check when no input_relevance entry matches", async () => {
    githubMockState.checkRuns = [
      { name: "Deploy Edge Functions", status: "completed", conclusion: "failure" },
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
      required_checks: [Deploy Edge Functions]
      optional_checks: []
      missing_required: skip`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.releaseReady).toBe(false);
    expect(result.releaseReadyReasons).toContain(
      'Required CI check "Deploy Edge Functions" is FAIL',
    );
    expect(result.releaseBrief?.verdict).toBe("block");
  });

  it("missing_blocking: an absent required check still blocks and is labelled", async () => {
    githubMockState.checkRuns = [];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
gate:
  mode: release-ready
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    ci:
      required_checks: [Playwright]
      optional_checks: []
      missing_required: fail`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.releaseReady).toBe(false);
    expect(result.releaseReadyReasons).toContain(
      'Required CI check "Playwright" is MISSING',
    );
    expect(result.ci?.checks[0].disposition?.kind).toBe("missing_blocking");
    expect(result.releaseBrief?.inputs[0].disposition).toBe("missing_blocking");
  });

  it("Case A replay: ci-integrity patterns are enumerated, not just counted", async () => {
    githubMockState.filePages = {
      1: [
        {
          filename: ".github/workflows/ci.yml",
          additions: 2,
          deletions: 0,
          changes: 2,
          status: "modified",
          patch:
            "@@ -1,1 +1,3 @@\n+      run: npm test || true\n+    continue-on-error: true\n",
        },
      ],
    };

    const result = await evaluateGate(
      makeConfig({ githubToken: "ghp_test", securityGate: false }),
      "pull-request-head-sha",
      42,
    );

    expect(result.policyFindings).toContain(
      "CI integrity blocking patterns detected (2).",
    );

    const enumerated = (result.enumeratedFindings ?? []).filter((finding) =>
      finding.id.startsWith("ci_integrity/"),
    );
    expect(enumerated.map((finding) => finding.id)).toEqual([
      "ci_integrity/1",
      "ci_integrity/2",
    ]);
    expect(enumerated.every((finding) => finding.severity === "blocking")).toBe(true);
    expect(
      enumerated.every((finding) => finding.evidence === ".github/workflows/ci.yml"),
    ).toBe(true);
    expect(enumerated.map((finding) => finding.title)).toEqual([
      'workflow bypass pattern "|| true"',
      'introduced "continue-on-error: true"',
    ]);

    const briefFindings = result.releaseBrief?.findings ?? [];
    expect(briefFindings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["ci_integrity/1", "ci_integrity/2"]),
    );
  });

  // trailhead#350 defect 3: the remediation JSON only tells the truth if the gate
  // threads enumeratedFindings + riskScore/riskThreshold into buildRemediation.
  // Both assertions discriminate the threaded path from the legacy fallback:
  // risk.over_threshold cannot come from prose in risk-only mode (computeReleaseReady
  // returns early), and the enumerated policy.finding detail lists per-finding
  // titles where the legacy branch lists the count-strings.
  it("threads enumerated findings and risk numbers into the remediation JSON", async () => {
    githubMockState.filePages = {
      1: [
        {
          filename: ".github/workflows/ci.yml",
          additions: 2,
          deletions: 0,
          changes: 2,
          status: "modified",
          patch:
            "@@ -1,1 +1,3 @@\n+      run: npm test || true\n+    continue-on-error: true\n",
        },
        ...Array.from({ length: 12 }, (_, i) => ({
          filename: `src/module-${i}.ts`,
          additions: 80,
          deletions: 40,
          changes: 120,
          status: "modified" as const,
        })),
      ],
    };

    const result = await evaluateGate(
      makeConfig({ githubToken: "ghp_test", securityGate: false, riskThreshold: 5 }),
      "pull-request-head-sha",
      43,
    );

    expect(result.gateDecision).toBe("block");
    const fixes = result.remediation?.fixes ?? [];

    const overThreshold = fixes.find((fix) => fix.code === "risk.over_threshold");
    expect(overThreshold).toBeDefined();
    expect(overThreshold?.severity).toBe("blocking");
    expect(overThreshold?.title).toContain("threshold 5");
    expect(overThreshold?.suggested_action).toContain("trailhead-override");

    const policyFix = fixes.find((fix) => fix.code === "policy.finding");
    expect(policyFix).toBeDefined();
    expect(policyFix?.title).not.toMatch(/^\d+ policy finding/);
    expect(policyFix?.detail).toContain('workflow bypass pattern "|| true"');
    expect(policyFix?.detail).not.toContain("blocking patterns detected (");
  });

  it("attaches a Release Brief to every evaluation, with no config present", async () => {
    githubMockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "success" },
    ];

    const result = await evaluateGate(
      makeConfig({ githubToken: "ghp_test", securityGate: false }),
      "pull-request-head-sha",
      42,
    );

    const brief = result.releaseBrief;
    expect(brief).toBeDefined();
    expect(["allow", "warn", "block"]).toContain(brief!.verdict);
    expect(brief!.riskScore).toBe(result.riskScore);
    expect(Array.isArray(brief!.findings)).toBe(true);
    expect(Array.isArray(brief!.inputs)).toBe(true);
    expect(Array.isArray(brief!.actions)).toBe(true);
    expect(brief!.override).toBeNull();
    // Survives the GateEvaluation Zod schema (the store persists this object).
    expect(GateEvaluation.safeParse(result).success).toBe(true);
  });

  it("no-config runs keep their pre-ADR-011 decisions and CI rollup", async () => {
    githubMockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "failure" },
      { name: "Vercel", status: "completed", conclusion: "failure" },
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
      required_checks: [CI Gate]
      optional_checks: []
      missing_required: skip`,
      () =>
        evaluateGate(
          makeConfig({ githubToken: "ghp_test", securityGate: false }),
          "pull-request-head-sha",
          42,
        ),
    );

    expect(result.releaseReady).toBe(false);
    expect(result.releaseReadyReasons).toEqual(['Required CI check "CI Gate" is FAIL']);
    expect(result.ci?.allRequiredPassed).toBe(false);
    expect(result.ci?.failedCount).toBe(1);
    expect(result.ci?.pendingCount).toBe(0);
    expect(result.ci?.missingCount).toBe(0);
    // The non-required red check is advisory by default and does not block —
    // and the default says so, so its brief row is never a bare "advisory / —".
    expect(
      result.ci?.checks.find((check) => check.name === "Vercel")?.disposition,
    ).toEqual({ kind: "advisory", reason: DEFAULT_ADVISORY_REASON, source: "default" });
    expect(
      result.releaseBrief?.inputs.every((input) => (input.reason ?? "").trim() !== ""),
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // wait-for-checks default resolution.
  //
  // main.ts computes config.gateMode / config.waitForChecks from the raw
  // `gate-mode` / `wait-for-checks` action inputs alone — both are commonly
  // left unset, with release-ready mode instead coming from .trailhead.yml's
  // `gate.mode` (the standard way a repo declares it — RepoConfig's zod
  // schema defaults the whole `gate` object, so schema_version alone can't
  // signal "unset" to resolveGateMode's fallback). These tests call
  // evaluateGate the same way main.ts does in the common case: no gateMode,
  // no waitForChecks override in the passed-in config — proving the EFFECTIVE
  // gate mode (resolved from .trailhead.yml) is what decides whether the gate
  // waits, not the possibly-unset raw input main.ts saw before the repo
  // config was even loaded.
  // -------------------------------------------------------------------------

  describe("wait-for-checks default resolution", () => {
    beforeEach(() => {
      // core.warning's call history is not cleared by the file-level
      // beforeEach above (other tests in this file rely on it accumulating),
      // so scope the reset to this block only — each test here asserts on
      // whether *its own* run warned, not on residue from a sibling test.
      vi.mocked(core.warning).mockClear();
    });

    const pendingContextConfig = `schema_version: 2
gate:
  mode: release-ready
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    ci:
      required_checks: [CI Gate]
      optional_checks: []
      missing_required: fail`;

    it("waits on a still-pending required check when release-ready comes only from .trailhead.yml (no gate-mode/wait-for-checks inputs)", async () => {
      githubMockState.checkRuns = [
        { name: "CI Gate", status: "in_progress", conclusion: null },
      ];

      const result = await withLocalTrailheadConfig(pendingContextConfig, () =>
        evaluateGate(
          // No gateMode, no waitForChecks — exactly what main.ts passes
          // through when both action inputs are left unset.
          makeConfig({
            githubToken: "ghp_test",
            securityGate: false,
            waitTimeoutMinutes: 0,
          }),
          "pull-request-head-sha",
          42,
        ),
      );

      // A single-fetch, no-wait evaluation would report this identically
      // (still pending, not ready) — the distinguishing proof that the WAIT
      // path actually ran is the timeout warning waitForChecks emits when it
      // gives up at its deadline. fetchCheckRuns' immediate-evaluate fallback
      // never emits this warning.
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          "CI wait timed out after 0m with 1 check(s) still pending",
        ),
      );
      expect(result.ci?.pendingCount).toBe(1);
      expect(result.releaseReady).toBe(false);
      expect(result.releaseReadyReasons).toEqual([
        "1 required CI check(s) still pending",
      ]);
    });

    it("does not wait when wait-for-checks is explicitly disabled, even in release-ready mode", async () => {
      githubMockState.checkRuns = [
        { name: "CI Gate", status: "in_progress", conclusion: null },
      ];

      const result = await withLocalTrailheadConfig(pendingContextConfig, () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            securityGate: false,
            waitForChecks: false,
            waitTimeoutMinutes: 0,
          }),
          "pull-request-head-sha",
          42,
        ),
      );

      expect(core.warning).not.toHaveBeenCalledWith(
        expect.stringContaining("CI wait timed out"),
      );
      expect(result.ci?.pendingCount).toBe(1);
      expect(result.releaseReady).toBe(false);
    });

    it("does not default to waiting when the effective gate mode is advisory, not release-ready", async () => {
      githubMockState.checkRuns = [
        { name: "CI Gate", status: "in_progress", conclusion: null },
      ];

      const result = await withLocalTrailheadConfig(pendingContextConfig, () =>
        evaluateGate(
          makeConfig({
            githubToken: "ghp_test",
            securityGate: false,
            gateMode: "advisory",
            waitTimeoutMinutes: 0,
          }),
          "pull-request-head-sha",
          42,
        ),
      );

      expect(core.warning).not.toHaveBeenCalledWith(
        expect.stringContaining("CI wait timed out"),
      );
      expect(result.ci?.pendingCount).toBe(1);
      // advisory mode never blocks, regardless of releaseReady.
      expect(result.gateMode).toBe("advisory");
    });

    it("fails fast on a genuine required-check failure instead of waiting out a long timeout", async () => {
      githubMockState.checkRuns = [
        { name: "CI Gate", status: "completed", conclusion: "failure" },
        { name: "Deploy", status: "in_progress", conclusion: null },
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
      required_checks: [CI Gate, Deploy]
      optional_checks: []
      missing_required: fail`,
        () =>
          evaluateGate(
            // A real 30-minute default timeout — if the fix regresses to
            // waiting out the full window on any failure, this test would
            // hang until vitest's own test timeout instead of returning.
            makeConfig({ githubToken: "ghp_test", securityGate: false }),
            "pull-request-head-sha",
            42,
          ),
      );

      expect(githubMockState.checkRefs).toHaveLength(1);
      expect(result.ci?.failedCount).toBe(1);
      expect(result.ci?.pendingCount).toBe(1);
      expect(core.warning).not.toHaveBeenCalledWith(
        expect.stringContaining("CI wait timed out"),
      );
    });

    // komatik's actual .trailhead.yml has never had a `ci:` block — it
    // declares blocking checks purely via `input_relevance` glob/name
    // patterns. That leaves `ciConfig.required_checks` empty, so every
    // fetched check carries `required: false`. This is train-30's real
    // incident shape (run 32800812922, ctx "master-promotion"): gating the
    // wait path on `required_checks.length > 0` skipped it entirely here,
    // regardless of gate mode or wait-timeout-minutes, so the immediate
    // single-fetch path reported still-in-flight checks as failing the gate
    // on the spot.
    it("waits on checks blocked purely via input_relevance, with no ci: required_checks block at all (komatik's actual config shape)", async () => {
      githubMockState.checkRuns = [
        { name: "Build", status: "in_progress", conclusion: null },
        { name: "Test", status: "in_progress", conclusion: null },
      ];

      const result = await withLocalTrailheadConfig(
        `schema_version: 2
gate:
  mode: release-ready
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    input_relevance:
      - pattern: "Build"
        disposition: blocking
      - pattern: "Test"
        disposition: blocking`,
        () =>
          evaluateGate(
            makeConfig({
              githubToken: "ghp_test",
              securityGate: false,
              waitTimeoutMinutes: 0,
            }),
            "pull-request-head-sha",
            42,
          ),
      );

      // Same distinguishing proof as the sibling test above: the timeout
      // warning only fires from inside waitForChecks' poll loop, never from
      // the immediate-evaluate fallback.
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          "CI wait timed out after 0m with 2 check(s) still pending",
        ),
      );
      expect(githubMockState.checkRefs).toHaveLength(1);
      expect(result.ci?.pendingCount).toBe(2);
      expect(result.releaseReady).toBe(false);
      expect(result.releaseReadyReasons).toEqual([
        "2 required CI check(s) still pending",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // ADR-011 §1 — a BLOCK never renders as "No findings."
  //
  // Four block-capable sources are not detector pattern lists, so each needs
  // its own proof that the verdict it produced is also *named* in the brief.
  // -------------------------------------------------------------------------

  describe("every block-capable source reaches the Release Brief", () => {
    function agentPr(): void {
      githubMockState.pullRequest = {
        user: { login: "test-author" },
        base: { ref: "main" },
        head: { ref: "claude/add-auth", sha: "pull-request-head-sha" },
      };
      githubMockState.payload = { pull_request: githubMockState.pullRequest };
    }

    it("names the agent PR policy that forced the block", async () => {
      agentPr();
      githubMockState.filePages = {
        1: [
          {
            filename: "src/auth/session.ts",
            additions: 10,
            deletions: 0,
            changes: 10,
            status: "modified",
          },
        ],
      };

      const result = await withLocalTrailheadConfig(
        `schema_version: 2
policies:
  agent_prs:
    enabled: true
    mode: block
    required_approvals: 2
`,
        () =>
          evaluateGate(
            makeConfig({ githubToken: "ghp_test", securityGate: false }),
            "pull-request-head-sha",
            42,
          ),
      );

      expect(result.gateDecision).toBe("block");
      const findings = result.releaseBrief?.findings ?? [];
      expect(findings.length).toBeGreaterThan(0);
      const agentFindings = findings.filter((finding) =>
        finding.id.startsWith("agent_policy/"),
      );
      expect(agentFindings.length).toBeGreaterThan(0);
      expect(agentFindings.some((finding) => finding.severity === "blocking")).toBe(true);
      expect(agentFindings.some((finding) => /approval/i.test(finding.title))).toBe(true);
    });

    it("names the sensitive-file escalation that forced the block", async () => {
      githubMockState.filePages = {
        1: [
          {
            filename: "supabase/migrations/0001_init.sql",
            additions: 5,
            deletions: 0,
            changes: 5,
            status: "added",
          },
        ],
      };

      const result = await withLocalTrailheadConfig(
        `schema_version: 2
policies:
  sensitive_files:
    enabled: true
    mode: block
    threshold: 25
`,
        () =>
          evaluateGate(
            makeConfig({ githubToken: "ghp_test", securityGate: false }),
            "pull-request-head-sha",
            42,
          ),
      );

      expect(result.gateDecision).toBe("block");
      const findings = result.releaseBrief?.findings ?? [];
      expect(findings.length).toBeGreaterThan(0);
      const escalation = findings.find((finding) => finding.id === "sensitive_files/0");
      expect(escalation).toBeDefined();
      expect(escalation!.severity).toBe("blocking");
      expect(escalation!.title).toContain("sensitive_files score");
    });

    it("names the merge burst that forced the block", async () => {
      agentPr();
      const mergedAt = new Date().toISOString();
      githubMockState.closedPrs = Array.from({ length: 3 }, () => ({
        merged_at: mergedAt,
        user: { login: "test-author" },
      }));

      const result = await withLocalTrailheadConfig(
        `schema_version: 2
policies:
  session_correlation:
    enabled: true
    threshold: 3
    window_minutes: 60
    mode: block
`,
        () =>
          evaluateGate(
            makeConfig({ githubToken: "ghp_test", securityGate: false }),
            "pull-request-head-sha",
            42,
          ),
      );

      expect(result.gateDecision).toBe("block");
      const findings = result.releaseBrief?.findings ?? [];
      expect(findings.length).toBeGreaterThan(0);
      const burst = findings.filter((finding) =>
        finding.id.startsWith("session_correlation/"),
      );
      expect(burst.map((finding) => finding.id)).toEqual([
        "session_correlation/1",
        "session_correlation/2",
      ]);
      expect(burst.every((finding) => finding.severity === "blocking")).toBe(true);
      expect(burst[0].title).toContain("Rapid-fire merge burst detected: 3 merged PRs");
    });

    it("names each submission check instead of counting them", async () => {
      githubMockState.filePages = {
        1: [
          {
            filename: "src/rollout.ts",
            additions: 2,
            deletions: 0,
            changes: 2,
            status: "modified",
            patch: "@@ -1,1 +1,3 @@\n+// TODO: implement rollout\n+export const x = 1;\n",
          },
        ],
      };

      const result = await withLocalTrailheadConfig(
        `schema_version: 2
submission:
  enabled: true
  mode: block
`,
        () =>
          evaluateGate(
            makeConfig({
              githubToken: "ghp_test",
              submissionGate: true,
              securityGate: false,
            }),
            "pull-request-head-sha",
            42,
          ),
      );

      expect(result.gateDecision).toBe("block");
      // The count string stays for existing consumers…
      expect(result.policyFindings).toContain("Submission gate: 1 finding(s).");
      // …but the brief names the check, its detail and its severity.
      const findings = result.releaseBrief?.findings ?? [];
      expect(findings.length).toBeGreaterThan(0);
      const submission = findings.filter((finding) =>
        finding.id.startsWith("submission/"),
      );
      expect(submission).toEqual([
        {
          id: "submission/mock_placeholder/1",
          title: "Mock placeholder in production path",
          evidence: expect.stringContaining("src/rollout.ts"),
          severity: "blocking",
        },
      ]);
    });
  });

  describe("ADR-012 live override state", () => {
    const overrideConfig = () =>
      makeConfig({
        githubToken: "ghp_test",
        securityGate: false,
        gateMode: "release-ready",
        riskThreshold: 0,
      });

    it("applies an override added after the frozen event payload", async () => {
      githubMockState.payload = {
        pull_request: {
          ...githubMockState.pullRequest,
          labels: [],
        },
      };
      githubMockState.overrideLabels = ["trailhead-override"];
      githubMockState.overrideComments = [
        {
          body: "trailhead-override: operator accepted the promotion risk",
          author: { login: "david" },
        },
      ];

      const result = await evaluateGate(overrideConfig(), "pull-request-head-sha", 42);

      expect(result.policyOverride).toEqual(
        expect.objectContaining({
          source: "label",
          owner: "david",
          reason: "operator accepted the promotion risk",
        }),
      );
      expect(result.releaseReady).toBe(true);
      expect(result.labelOverrideFeedback?.source).toBe("live");
      expect(githubMockState.overrideGraphqlCalls).toBe(1);
    });

    it("treats live label removal as authoritative over a stale payload", async () => {
      githubMockState.payload = {
        pull_request: {
          ...githubMockState.pullRequest,
          labels: [{ name: "trailhead-override" }],
        },
      };
      githubMockState.overrideLabels = [];
      githubMockState.overrideComments = [
        {
          body: "trailhead-override: superseded decision",
          author: { login: "david" },
        },
      ];

      const result = await evaluateGate(overrideConfig(), "pull-request-head-sha", 42);

      expect(result.policyOverride).toBeUndefined();
      expect(result.labelOverrideFeedback).toEqual(
        expect.objectContaining({ status: "revoked", source: "live" }),
      );
      expect(result.labelOverrideFeedback?.message).toContain("no override is active");
    });

    it("ignores a frozen top-level comment when the live PR has no reason", async () => {
      githubMockState.payload = {
        pull_request: {
          ...githubMockState.pullRequest,
          labels: [{ name: "trailhead-override" }],
        },
        comment: {
          body: "trailhead-override: stale diff-comment approval",
          user: { login: "reviewer" },
        },
      };
      githubMockState.overrideLabels = ["trailhead-override"];
      githubMockState.overrideComments = [];

      const result = await evaluateGate(overrideConfig(), "pull-request-head-sha", 42);

      expect(result.policyOverride).toBeUndefined();
      expect(result.labelOverrideFeedback).toEqual(
        expect.objectContaining({ status: "rejected", source: "live" }),
      );
      expect(result.labelOverrideFeedback?.message).toContain("no valid override reason");
    });

    it("keeps frozen label and reason traces diagnostic-only when live state fails", async () => {
      githubMockState.overrideGraphqlError = new Error("forbidden");
      githubMockState.eventName = "issue_comment";
      githubMockState.payload = {
        issue: { pull_request: {} },
        comment: {
          body: "trailhead-override: revoked before this stale event reran",
          user: { login: "david" },
        },
      };

      const result = await evaluateGate(overrideConfig(), "pull-request-head-sha", 42, {
        baseRef: "main",
        headRef: "feature/test",
        labels: ["trailhead-override"],
        authorLogin: "david",
      });

      expect(result.policyOverride).toBeUndefined();
      expect(result.releaseReady).toBe(false);
      expect(result.labelOverrideFeedback).toEqual(
        expect.objectContaining({
          status: "unavailable",
          source: "payload_fallback",
        }),
      );
      expect(result.releaseBrief?.overrideStatus?.message).toContain(
        "never trusted to authorize an override",
      );
    });

    it("discloses no-token payload fallback even when no trace is visible", async () => {
      const result = await evaluateGate(
        makeConfig({
          securityGate: false,
          gateMode: "release-ready",
          riskThreshold: 0,
        }),
        "pull-request-head-sha",
        42,
      );

      expect(result.releaseBrief?.overrideStatus).toEqual(
        expect.objectContaining({
          status: "unavailable",
          source: "payload_fallback",
        }),
      );
      expect(result.releaseBrief?.overrideStatus?.message).toContain("no GitHub token");
    });
  });
});
