import { vi } from "vitest";
import * as core from "@actions/core";
import * as github from "@actions/github";
import * as gate from "../gate.js";
import * as notify from "../notify.js";
import * as healers from "../healers/index.js";
import * as ciExternal from "../ci-external.js";
import type { GateEvaluation } from "../types.js";

function makeEvaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "dg-abc1234-1234567890",
    repoId: "test-owner/test-repo",
    commitSha: "abc1234567890",
    healthScore: 100,
    riskScore: 30,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 42,
    ...overrides,
  };
}

function setupInputs(inputs: Record<string, string>): void {
  vi.mocked(core.getInput).mockImplementation((name: string) => inputs[name] ?? "");
}

describe("run (main entrypoint)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(core.getInput).mockReturnValue("");
    (
      github.context as {
        payload: { pull_request?: { number: number; head: { sha: string } } };
      }
    ).payload = {
      pull_request: { number: 42, head: { sha: "pr-head-sha-123" } },
    };

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          createComment: vi.fn().mockResolvedValue({}),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
          updateComment: vi.fn().mockResolvedValue({}),
          listLabelsOnIssue: vi.fn().mockResolvedValue({ data: [] }),
          createLabel: vi.fn().mockResolvedValue({}),
          removeLabel: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
        checks: {
          create: vi.fn().mockResolvedValue({}),
        },
        pulls: {
          requestReviewers: vi.fn().mockResolvedValue({}),
          listFiles: vi.fn().mockResolvedValue({ data: [] }),
          get: vi.fn().mockResolvedValue({ data: {} }),
          listCommits: vi.fn().mockResolvedValue({ data: [] }),
          listReviews: vi.fn().mockResolvedValue({ data: [] }),
        },
        repos: {
          getContent: vi.fn().mockRejectedValue(new Error("not found")),
          listCommits: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
      request: vi.fn().mockResolvedValue({ data: [] }),
    } as never);

    delete process.env.TRAILHEAD_TEST_FAILURES;
  });

  it("runs end-to-end with mocked dependencies", async () => {
    const registerSpy = vi
      .spyOn(healers, "registerHealer")
      .mockImplementation(() => undefined);
    vi.spyOn(gate, "evaluateGate").mockResolvedValue(makeEvaluation());
    setupInputs({ "api-key": "test-key" });

    const eval_ = makeEvaluation();
    vi.spyOn(gate, "evaluateGate").mockResolvedValue(eval_);
    vi.spyOn(gate, "formatGateReport").mockReturnValue("## Report");
    const commentSpy = vi.spyOn(gate, "postPrComment").mockResolvedValue();
    const checkSpy = vi.spyOn(gate, "createCheckRun").mockResolvedValue();
    const ciManifestSpy = vi
      .spyOn(ciExternal, "resolveCiManifests")
      .mockResolvedValue(null);
    const webhookSpy = vi.spyOn(notify, "deliverWebhooks").mockResolvedValue();
    const storeSpy = vi.spyOn(notify, "storeEvaluationDetailed").mockResolvedValue({
      stored: true,
      quotaExceeded: false,
      suspended: false,
      hardCapped: false,
    });
    setupInputs({
      "api-key": "test-key",
      "github-token": "ghp_test",
      "webhook-url": "https://hooks.slack.com/test",
      "webhook-events": "warn,block",
      "evaluation-store-url": "https://example.com/api/trailhead/store",
      "disable-cloud-upsell": "true",
    });

    await import("../main.js");
    await new Promise((r) => setTimeout(r, 0));

    expect(gate.evaluateGate).toHaveBeenCalledWith(
      expect.any(Object),
      "pr-head-sha-123",
      42,
    );
    expect(ciManifestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: "pr-head-sha-123" }),
    );
    expect(registerSpy).toHaveBeenCalledTimes(3);
    expect(core.setOutput).toHaveBeenCalledWith("health-score", "100");
    expect(core.setOutput).toHaveBeenCalledWith("risk-score", "30");
    expect(core.setOutput).toHaveBeenCalledWith("gate-decision", "allow");
    expect(core.setOutput).toHaveBeenCalledWith(
      "evaluation-json",
      expect.stringContaining('"gateDecision":"allow"'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "verdict-json",
      expect.stringContaining('"schema":"trailhead.verdict.v1"'),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "rollout-readiness-json",
      expect.stringContaining('"band"'),
    );
    expect(commentSpy).toHaveBeenCalledWith("## Report", 42, "ghp_test");
    expect(checkSpy).toHaveBeenCalled();
    expect(webhookSpy).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      eval_,
      ["warn", "block"],
      expect.objectContaining({ riskThreshold: expect.any(Number) }),
    );
    expect(storeSpy).toHaveBeenCalledWith(
      "https://example.com/api/trailhead/store",
      eval_,
      { maxRetries: 3 },
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});

/**
 * Cloud-upsell footer, exercised end-to-end through `run()`. Each `run()`
 * import has module-level side effects that only fire once per module
 * instance, so these tests reset the module registry and re-import every
 * dependency (including the @actions/* mocks) fresh per scenario.
 */
describe("run — cloud-upsell footer in the check summary", () => {
  async function runMain(options: {
    inputs: Record<string, string>;
    storeOutcome?: {
      stored: boolean;
      quotaExceeded: boolean;
      suspended: boolean;
      hardCapped: boolean;
    };
  }): Promise<{
    freshCore: typeof import("@actions/core");
    summaryText: string;
  }> {
    vi.resetModules();

    const freshCore = await import("@actions/core");
    const freshGithub = await import("@actions/github");
    const freshGate = await import("../gate.js");
    const freshNotify = await import("../notify.js");
    const freshHealers = await import("../healers/index.js");

    vi.mocked(freshCore.getInput).mockImplementation(
      (name: string) => options.inputs[name] ?? "",
    );
    (freshGithub.context as { payload: { pull_request?: { number: number } } }).payload =
      {
        pull_request: { number: 42 },
      };
    vi.mocked(freshGithub.getOctokit).mockReturnValue({
      rest: {
        issues: {
          createComment: vi.fn().mockResolvedValue({}),
          listComments: vi.fn().mockResolvedValue({ data: [] }),
          updateComment: vi.fn().mockResolvedValue({}),
          listLabelsOnIssue: vi.fn().mockResolvedValue({ data: [] }),
          createLabel: vi.fn().mockResolvedValue({}),
          removeLabel: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({}),
        },
        checks: { create: vi.fn().mockResolvedValue({}) },
        pulls: {
          requestReviewers: vi.fn().mockResolvedValue({}),
          listFiles: vi.fn().mockResolvedValue({ data: [] }),
          get: vi.fn().mockResolvedValue({ data: {} }),
          listCommits: vi.fn().mockResolvedValue({ data: [] }),
          listReviews: vi.fn().mockResolvedValue({ data: [] }),
        },
        repos: {
          getContent: vi.fn().mockRejectedValue(new Error("not found")),
          listCommits: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
      request: vi.fn().mockResolvedValue({ data: [] }),
    } as never);

    vi.spyOn(freshHealers, "registerHealer").mockImplementation(() => undefined);
    vi.spyOn(freshGate, "evaluateGate").mockResolvedValue(makeEvaluation());
    vi.spyOn(freshGate, "formatGateReport").mockReturnValue("## Report");
    vi.spyOn(freshGate, "postPrComment").mockResolvedValue();
    vi.spyOn(freshGate, "createCheckRun").mockResolvedValue();
    if (options.storeOutcome) {
      vi.spyOn(freshNotify, "storeEvaluationDetailed").mockResolvedValue(
        options.storeOutcome,
      );
    }

    await import("../main.js");
    await new Promise((r) => setTimeout(r, 0));

    const summaryText = vi
      .mocked(freshCore.summary.addRaw)
      .mock.calls.map((call) => call[0])
      .join("\n");

    return { freshCore, summaryText };
  }

  it("appends the no-key upsell footer when no trailhead-api-key is set", async () => {
    const { summaryText } = await runMain({ inputs: { "api-key": "test-key" } });

    expect(summaryText).toContain("wasn't persisted");
    expect(summaryText).toContain("Trailhead Cloud");
    expect(summaryText).toContain("utm_campaign=cloud-upsell");
  });

  it("suppresses the footer when disable-cloud-upsell is true", async () => {
    const { summaryText } = await runMain({
      inputs: { "api-key": "test-key", "disable-cloud-upsell": "true" },
    });

    expect(summaryText).not.toContain("Trailhead Cloud");
    expect(summaryText).not.toContain("utm_campaign");
  });

  it("does not append the no-key footer when a trailhead-api-key is configured", async () => {
    const { summaryText } = await runMain({
      inputs: { "api-key": "test-key", "trailhead-api-key": "th_live_abc" },
      storeOutcome: {
        stored: true,
        quotaExceeded: false,
        suspended: false,
        hardCapped: false,
      },
    });

    expect(summaryText).not.toContain("utm_campaign=cloud-upsell");
  });

  it("does not show the no-key upsell to BYOS self-hosters (evaluation-store-url without a cloud key)", async () => {
    const { summaryText } = await runMain({
      inputs: {
        "api-key": "test-key",
        "evaluation-store-url": "https://store.example.com",
      },
      storeOutcome: {
        stored: true,
        quotaExceeded: false,
        suspended: false,
        hardCapped: false,
      },
    });

    expect(summaryText).not.toContain("wasn't persisted");
    expect(summaryText).not.toContain("utm_campaign=cloud-upsell");
  });

  it("appends the soft quota-exceeded footer when the cloud store reports quotaExceeded", async () => {
    const { summaryText } = await runMain({
      inputs: { "api-key": "test-key", "trailhead-api-key": "th_live_abc" },
      storeOutcome: {
        stored: true,
        quotaExceeded: true,
        suspended: false,
        hardCapped: false,
      },
    });

    expect(summaryText).toContain("Over your plan's monthly evaluations");
    expect(summaryText).toContain("utm_campaign=quota-upsell");
  });

  it("appends the suspended footer and does not fail the gate on 402", async () => {
    const { freshCore, summaryText } = await runMain({
      inputs: { "api-key": "test-key", "trailhead-api-key": "th_live_abc" },
      storeOutcome: {
        stored: false,
        quotaExceeded: false,
        suspended: true,
        hardCapped: false,
      },
    });

    expect(summaryText).toContain("suspended");
    expect(summaryText).toContain("utm_campaign=suspended-upsell");
    expect(freshCore.setFailed).not.toHaveBeenCalled();
  });

  it("appends the hard-cap footer and does not fail the gate on 429", async () => {
    const { freshCore, summaryText } = await runMain({
      inputs: { "api-key": "test-key", "trailhead-api-key": "th_live_abc" },
      storeOutcome: {
        stored: false,
        quotaExceeded: false,
        suspended: false,
        hardCapped: true,
      },
    });

    expect(summaryText).toContain("hard usage cap");
    expect(summaryText).toContain("utm_campaign=quota-upsell");
    expect(freshCore.setFailed).not.toHaveBeenCalled();
  });
});
