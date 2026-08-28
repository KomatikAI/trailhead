/**
 * Adversarial verification of the #362 ruling as preserved by ADR-012 (#361).
 *
 * The pinned production behavior is: a FAILED live label read warns, falls back
 * to the triggering event's payload labels, and STILL AUTHORIZES the override.
 * These tests attack that from the harshest angles the mocked suite can reach —
 * the live label read failing, and every live read (labels AND comments)
 * failing at once — plus the two auto-green regressions the review named.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";

import { evaluateGate } from "../gate.js";
import { checkConclusionForEvaluation, resolveCheckName } from "../release-ready.js";
import type { GateEvaluation, TrailheadConfig } from "../types.js";

const mockState = vi.hoisted(() => ({
  liveLabels: [] as Array<{ name: string }>,
  payloadLabels: [] as Array<{ name: string }>,
  comments: [] as Array<{ body: string; user?: { login: string } }>,
  checkRuns: [] as Array<{ name: string; status: string; conclusion: string | null }>,
  pullsGetFails: false,
  listCommentsFails: false,
  eventName: "pull_request",
  payloadComment: null as { body: string; user?: { login: string } } | null,
  listCommentsCalls: 0,
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
    sha: "head-sha",
    get eventName() {
      return mockState.eventName;
    },
    get payload() {
      return {
        pull_request: {
          user: { login: "release-bot[bot]" },
          base: { ref: "main" },
          head: { ref: "release/train-9", sha: "head-sha" },
          labels: mockState.payloadLabels,
        },
        ...(mockState.eventName === "issue_comment"
          ? {
              issue: { pull_request: {} },
              comment: mockState.payloadComment ?? undefined,
            }
          : {}),
      };
    },
  },
  getOctokit: (_token: string) => ({
    rest: {
      pulls: {
        get: vi.fn().mockImplementation(async () => {
          if (mockState.pullsGetFails) throw new Error("HttpError: 503 live label read");
          return {
            data: {
              state: "open",
              user: { login: "release-bot[bot]" },
              created_at: new Date().toISOString(),
              base: { ref: "main" },
              head: { ref: "release/train-9", sha: "head-sha" },
              labels: mockState.liveLabels,
              body: "## Plan\n- [x] tests",
            },
          };
        }),
        listFiles: vi.fn().mockResolvedValue({
          data: [{ filename: "src/app.ts", additions: 4, deletions: 1, changes: 5 }],
        }),
        listCommits: vi.fn().mockResolvedValue({
          data: [
            {
              sha: "pr-commit-1",
              author: { login: "release-bot[bot]" },
              commit: {
                message: "chore: promote",
                author: { name: "Release Bot", email: "bot@example.com" },
              },
            },
          ],
        }),
        listReviews: vi.fn().mockResolvedValue({ data: [] }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      issues: {
        listComments: vi.fn().mockImplementation(async () => {
          mockState.listCommentsCalls += 1;
          if (mockState.listCommentsFails) {
            throw new Error("HttpError: 503 live comment read");
          }
          return { data: mockState.comments };
        }),
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
      checks: {
        listForRef: vi.fn().mockImplementation(async () => ({
          data: { check_runs: mockState.checkRuns },
        })),
      },
      repos: {
        getCommit: vi.fn().mockResolvedValue({ data: { files: [] } }),
        listCommits: vi.fn().mockResolvedValue({ data: [] }),
        getContent: vi.fn().mockRejectedValue(new Error("not found")),
      },
    },
  }),
}));

function makeConfig(overrides: Partial<TrailheadConfig> = {}): TrailheadConfig {
  return {
    apiKey: "",
    apiUrl: "",
    riskThreshold: 70,
    failMode: "open",
    selfHeal: false,
    addRiskLabels: true,
    reviewersOnRisk: [],
    webhookEvents: ["warn", "block"],
    healthCheckUrls: [],
    githubToken: "ghp_test",
    securityGate: false,
    waitTimeoutMinutes: 0,
    ...overrides,
  };
}

async function withConfig<T>(content: string, run: () => Promise<T>): Promise<T> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "adr012-verify-"));
  await writeFile(path.join(workspace, ".trailhead.yml"), content, "utf-8");
  vi.stubEnv("GITHUB_WORKSPACE", workspace);
  try {
    return await run();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/** release-ready with one required check, red below → the override has work to do. */
const RELEASE_READY_CONFIG = `schema_version: 2
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

/** No `gate:` block at all — the komatik shape, for check-name invariance. */
const NO_GATE_BLOCK_CONFIG = `schema_version: 2
contexts:
  - name: main-pr
    match:
      base_branch: [main]
    ci:
      required_checks: [CI Gate]
      optional_checks: []
      missing_required: fail`;

describe("ADR-012 verification — the #362 ruling holds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mockState.liveLabels = [];
    mockState.payloadLabels = [];
    mockState.comments = [];
    mockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "failure" },
    ];
    mockState.pullsGetFails = false;
    mockState.listCommentsFails = false;
    mockState.eventName = "pull_request";
    mockState.payloadComment = null;
    mockState.listCommentsCalls = 0;
    vi.stubEnv("GITHUB_WORKSPACE", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("RULING: live label read throws, payload carries the override → override APPLIES", async () => {
    mockState.pullsGetFails = true;
    mockState.payloadLabels = [{ name: "trailhead-override" }];
    mockState.liveLabels = [];
    mockState.comments = [
      { body: "trailhead-override: prod outage", user: { login: "dschirmer" } },
    ];

    const result = await withConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "head-sha", 4929),
    );

    // Warned, fell back, and STILL AUTHORIZED.
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Could not read live labels for PR #4929"),
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("falling back to the triggering event's payload labels"),
    );
    expect(result.policyOverride).toBeDefined();
    expect(result.policyOverride?.source).toBe("label");
    expect(result.policyOverride?.owner).toBe("dschirmer");
    expect(result.releaseReady).toBe(true);
    expect(result.labelOverrideFeedback?.status).toBe("applied");
  });

  it("RULING (hardest): BOTH live reads throw, payload comment authorizes with source payload_fallback", async () => {
    // Labels API down AND comments API down. The only surviving evidence is the
    // triggering issue_comment payload. #362 says that must still authorize.
    mockState.pullsGetFails = true;
    mockState.listCommentsFails = true;
    mockState.eventName = "issue_comment";
    mockState.payloadLabels = [{ name: "trailhead-override" }];
    mockState.liveLabels = [];
    mockState.payloadComment = {
      body: "trailhead-override: prod outage, release train pinned",
      user: { login: "dschirmer" },
    };

    const result = await withConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "head-sha", 4929),
    );

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Could not read live PR comments for the override"),
    );
    expect(result.policyOverride).toBeDefined();
    expect(result.policyOverride?.reason).toBe("prod outage, release train pinned");
    expect(result.releaseReady).toBe(true);
    expect(result.labelOverrideFeedback?.status).toBe("applied");
    // Provenance is disclosed, not hidden.
    expect(result.labelOverrideFeedback?.source).toBe("payload_fallback");
  });

  it("(g) no comment fetch without override intent", async () => {
    mockState.payloadLabels = [];
    mockState.liveLabels = [];

    await withConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "head-sha", 4929),
    );

    expect(mockState.listCommentsCalls).toBe(0);
  });

  it("(a) a stale override label on an ALREADY-READY PR adds no rejection policyFinding", async () => {
    // Green required check → releaseReady on its own merits; the override is
    // not_needed. app/src/verdict.ts ingests every policyFinding, so a rejection
    // line here would turn a green server-side verdict red.
    mockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "success" },
    ];
    mockState.liveLabels = [{ name: "trailhead-override" }];
    mockState.payloadLabels = [{ name: "trailhead-override" }];
    mockState.comments = [
      { body: "trailhead-override: belt and braces", user: { login: "dschirmer" } },
    ];

    const result = await withConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "head-sha", 4929),
    );

    expect(result.releaseReady).toBe(true);
    expect(result.labelOverrideFeedback?.status).toBe("rejected");
    // The operator still gets the remove-the-stale-label feedback...
    expect(result.labelOverrideFeedback?.message).toBeTruthy();
    // ...but it never becomes a policy finding.
    const findings = result.policyFindings ?? [];
    expect(findings.join("\n")).not.toContain(result.labelOverrideFeedback!.message);
    expect(
      findings.some(
        (f) => /override/i.test(f) && /reject|not needed|not_needed/i.test(f),
      ),
    ).toBe(false);
  });

  it("(d) a cannot-evaluate run NEVER publishes conclusion success", async () => {
    const base = {
      id: "dg-1",
      repoId: "o/r",
      commitSha: "abc",
      healthScore: 0,
      riskScore: 0,
      healthChecks: [],
      riskFactors: [],
      evaluationMs: 0,
    } as unknown as GateEvaluation;

    // fail-open (the default for any repo that leaves `environment` unset)
    const failOpen: GateEvaluation = {
      ...base,
      gateDecision: "allow",
      releaseReady: true,
      gateMode: "release-ready",
      releaseBrief: { verdict: "cannot_evaluate" } as GateEvaluation["releaseBrief"],
    };
    expect(checkConclusionForEvaluation(failOpen)).toBe("neutral");
    expect(checkConclusionForEvaluation(failOpen)).not.toBe("success");

    // fail-closed
    const failClosed: GateEvaluation = {
      ...failOpen,
      gateDecision: "block",
      releaseReady: false,
    };
    expect(checkConclusionForEvaluation(failClosed)).toBe("failure");

    // cannot_evaluate must beat EVERY mode — no mode may leak a success.
    for (const mode of ["release-ready", "advisory", "risk-only"] as const) {
      for (const decision of ["allow", "warn", "block"] as const) {
        const evalu: GateEvaluation = {
          ...failOpen,
          gateMode: mode,
          gateDecision: decision,
          releaseReady: true,
        };
        expect(checkConclusionForEvaluation(evalu)).not.toBe("success");
      }
    }
  });

  it("CHECK-NAME INVARIANCE: a config with no `gate:` block keeps the mode default", async () => {
    mockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "success" },
    ];

    // komatik's shape: no gate block, gate-mode supplied as an action input.
    for (const [mode, expected] of [
      ["release-ready", "Trailhead — Release Ready"],
      ["advisory", "Trailhead — Release Ready"],
    ] as const) {
      const result = await withConfig(NO_GATE_BLOCK_CONFIG, () =>
        evaluateGate(makeConfig({ gateMode: mode }), "head-sha", 4929),
      );
      expect(result.resolvedCheckName).toBe(expected);
    }

    // And with no gate-mode input at all (effective risk-only), the mode default.
    const riskOnly = await withConfig(NO_GATE_BLOCK_CONFIG, () =>
      evaluateGate(makeConfig(), "head-sha", 4929),
    );
    expect(riskOnly.resolvedCheckName).toBe("Trailhead");

    // Pin the resolver itself: an unset name never invents a custom context.
    expect(resolveCheckName("risk-only", undefined)).toBe("Trailhead");
    expect(resolveCheckName("release-ready", undefined)).toBe(
      "Trailhead — Release Ready",
    );
    expect(resolveCheckName("advisory", undefined)).toBe("Trailhead — Release Ready");
  });
});
