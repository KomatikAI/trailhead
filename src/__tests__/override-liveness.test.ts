/**
 * Label liveness.
 *
 * `github.context.payload` is a snapshot of the event that created the run.
 * Re-running a workflow replays that ORIGINAL payload, so any label applied
 * after the run was created is absent from it. That made the sanctioned
 * `trailhead-override` label unusable as a remedy for a red required check:
 * GitHub only turns a failed check suite green by rerunning it, and the rerun
 * was the one path guaranteed never to see the new label.
 *
 * These tests pin the fix at the layer where it has to live — evaluateGate's
 * single PR context — so the override, context matching and merge-queue
 * detection all read the same live labels.
 */
import { vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";

import { evaluateGate } from "../gate.js";
import type { TrailheadConfig } from "../types.js";

const githubMockState = vi.hoisted(() => ({
  /** Labels the API reports right now — what a live read sees. */
  liveLabels: [] as Array<{ name: string }>,
  /** Labels frozen into the triggering event's payload. */
  payloadLabels: [] as Array<{ name: string }>,
  comments: [] as Array<{ body: string; user?: { login: string } }>,
  checkRuns: [] as Array<{ name: string; status: string; conclusion: string | null }>,
  pullsGetFails: false,
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
    sha: "pull-request-head-sha",
    eventName: "pull_request",
    get payload() {
      return {
        pull_request: {
          user: { login: "release-bot[bot]" },
          base: { ref: "main" },
          head: { ref: "release/train-9", sha: "pull-request-head-sha" },
          labels: githubMockState.payloadLabels,
        },
      };
    },
  },
  getOctokit: (_token: string) => ({
    rest: {
      pulls: {
        get: vi.fn().mockImplementation(async () => {
          if (githubMockState.pullsGetFails) {
            throw new Error("HttpError: 503 Service Unavailable");
          }
          return {
            data: {
              state: "open",
              user: { login: "release-bot[bot]" },
              created_at: new Date().toISOString(),
              base: { ref: "main" },
              head: { ref: "release/train-9", sha: "pull-request-head-sha" },
              labels: githubMockState.liveLabels,
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
        listComments: vi.fn().mockImplementation(async () => ({
          data: githubMockState.comments,
        })),
      },
      checks: {
        listForRef: vi.fn().mockImplementation(async () => ({
          data: { check_runs: githubMockState.checkRuns },
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

async function withLocalTrailheadConfig<T>(
  content: string,
  run: () => Promise<T>,
): Promise<T> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "trailhead-liveness-"));
  await writeFile(path.join(workspace, ".trailhead.yml"), content, "utf-8");
  vi.stubEnv("GITHUB_WORKSPACE", workspace);
  try {
    return await run();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/** Release-ready gate with one required check, which is red below. */
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

describe("PR label liveness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    githubMockState.liveLabels = [];
    githubMockState.payloadLabels = [];
    githubMockState.comments = [];
    githubMockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "failure" },
    ];
    githubMockState.pullsGetFails = false;
    vi.stubEnv("GITHUB_WORKSPACE", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("applies the override from a label added after the triggering event (the rerun case)", async () => {
    // The operator applied the label AFTER the run that is now being rerun,
    // so it exists on the PR but not in the replayed payload.
    githubMockState.payloadLabels = [];
    githubMockState.liveLabels = [{ name: "trailhead-override" }];
    githubMockState.comments = [
      {
        body: "trailhead-override: release train blocked on a known-flaky suite",
        user: { login: "dschirmer" },
      },
    ];

    const result = await withLocalTrailheadConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "pull-request-head-sha", 4929),
    );

    expect(result.policyOverride).toBeDefined();
    expect(result.policyOverride?.source).toBe("label");
    expect(result.policyOverride?.owner).toBe("dschirmer");
    expect(result.policyOverride?.reason).toBe(
      "release train blocked on a known-flaky suite",
    );
    expect(result.releaseReady).toBe(true);
    // The label drift is narrated, not silently swallowed.
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("labels changed since this run's triggering event"),
    );
  });

  it("honors a label removed since the triggering event", async () => {
    // Payload still carries the override; the PR no longer does.
    githubMockState.payloadLabels = [{ name: "trailhead-override" }];
    githubMockState.liveLabels = [];
    githubMockState.comments = [
      { body: "trailhead-override: no longer needed", user: { login: "dschirmer" } },
    ];

    const result = await withLocalTrailheadConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "pull-request-head-sha", 4929),
    );

    expect(result.policyOverride).toBeUndefined();
    expect(result.releaseReady).toBe(false);
  });

  it("falls back to payload labels and warns when the live read fails", async () => {
    githubMockState.pullsGetFails = true;
    githubMockState.payloadLabels = [{ name: "trailhead-override" }];
    githubMockState.liveLabels = [];
    githubMockState.comments = [
      { body: "trailhead-override: prod outage", user: { login: "dschirmer" } },
    ];

    const result = await withLocalTrailheadConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "pull-request-head-sha", 4929),
    );

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Could not read live labels for PR #4929"),
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("falling back to the triggering event's payload labels"),
    );
    // Fallback is a degradation, not a regression: the payload label still works.
    expect(result.policyOverride?.source).toBe("label");
    expect(result.releaseReady).toBe(true);
  });

  it("keeps explicit backfill metadata authoritative over the live read", async () => {
    // evaluate-pr builds metadata from its own live pulls.get in main.ts.
    githubMockState.liveLabels = [{ name: "trailhead-override" }];
    githubMockState.payloadLabels = [];
    githubMockState.comments = [
      { body: "trailhead-override: prod outage", user: { login: "dschirmer" } },
    ];

    const result = await withLocalTrailheadConfig(RELEASE_READY_CONFIG, () =>
      evaluateGate(makeConfig(), "pull-request-head-sha", 4929, {
        baseRef: "main",
        headRef: "release/train-9",
        labels: [],
        authorLogin: "release-bot[bot]",
      }),
    );

    expect(result.policyOverride).toBeUndefined();
    expect(result.releaseReady).toBe(false);
  });

  it("matches a v4 context on a live label the payload never carried", async () => {
    // Proves the live read lands ABOVE the override — every label consumer
    // (context matching here, merge-queue detection, the override) reads it.
    githubMockState.payloadLabels = [];
    githubMockState.liveLabels = [{ name: "release-train" }];
    githubMockState.checkRuns = [
      { name: "CI Gate", status: "completed", conclusion: "success" },
    ];

    const result = await withLocalTrailheadConfig(
      `schema_version: 2
gate:
  mode: release-ready
contexts:
  - name: release-train
    match:
      base_branch: [main]
      labels: ["release-train"]
    ci:
      required_checks: [CI Gate]
      optional_checks: []
      missing_required: fail
  - name: main-pr
    match:
      base_branch: [main]
    ci:
      required_checks: [CI Gate]
      optional_checks: []
      missing_required: fail`,
      () => evaluateGate(makeConfig(), "pull-request-head-sha", 4929),
    );

    expect(result.context?.name).toBe("release-train");
  });
});
