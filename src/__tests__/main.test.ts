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

    const eval_ = makeEvaluation({
      gateMode: "release-ready",
      resolvedCheckName: "Custom Release Gate",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });
    vi.spyOn(gate, "evaluateGate").mockResolvedValue(eval_);
    vi.spyOn(gate, "formatGateReport").mockImplementation((evaluation) =>
      evaluation.releaseBrief?.requiredCheck
        ? "## Report\nrequired check not published"
        : "## Report",
    );
    const commentSpy = vi.spyOn(gate, "postPrComment").mockResolvedValue();
    const checkSpy = vi.spyOn(gate, "createCheckRun").mockResolvedValue({
      published: false,
      name: "Trailhead — Release Ready",
      headSha: eval_.commitSha,
    });
    const ciManifestSpy = vi
      .spyOn(ciExternal, "resolveCiManifests")
      .mockResolvedValue(null);
    const webhookSpy = vi.spyOn(notify, "deliverWebhooks").mockResolvedValue();
    let storedSnapshot: GateEvaluation | undefined;
    const storeSpy = vi
      .spyOn(notify, "storeEvaluationDetailed")
      .mockImplementation(async (_url, evaluation) => {
        storedSnapshot = structuredClone(evaluation);
        return {
          stored: true,
          quotaExceeded: false,
          suspended: false,
          hardCapped: false,
        };
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
      undefined,
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
    expect(commentSpy).toHaveBeenCalledWith(
      "## Report\nrequired check not published",
      42,
      "ghp_test",
    );
    expect(checkSpy).toHaveBeenCalled();
    expect(checkSpy).toHaveBeenCalledWith(
      eval_,
      "## Report",
      "ghp_test",
      "Custom Release Gate",
    );
    expect(eval_.releaseBrief?.requiredCheck).toEqual(
      expect.objectContaining({
        published: false,
        eventName: "pull_request",
        message: expect.stringContaining("cannot satisfy branch protection"),
      }),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "release-brief-json",
      expect.stringContaining('"published":false'),
    );
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
    expect(storedSnapshot?.releaseBrief?.requiredCheck).toEqual(
      expect.objectContaining({
        published: false,
        name: "Custom Release Gate",
      }),
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});

describe("run — evaluate-pr target metadata", () => {
  it("passes the fetched PR branch, labels, and author into gate evaluation", async () => {
    vi.resetModules();

    const freshCore = await import("@actions/core");
    const freshGithub = await import("@actions/github");
    const freshGate = await import("../gate.js");
    const freshHealers = await import("../healers/index.js");

    vi.mocked(freshCore.getInput).mockImplementation(
      (name: string) =>
        ({
          "github-token": "ghp_test",
          "evaluate-pr": "99",
          "security-gate": "false",
          "disable-cloud-upsell": "true",
        })[name] ?? "",
    );
    (
      freshGithub.context as {
        payload: Record<string, unknown>;
        sha: string;
      }
    ).payload = {};
    freshGithub.context.sha = "workflow-dispatch-sha";

    const getPr = vi.fn().mockResolvedValue({
      data: {
        state: "open",
        base: { ref: "master" },
        head: { ref: "promotion/train-28", sha: "target-head-sha" },
        labels: [{ name: "release-train" }, { name: "urgent" }],
        user: { login: "train-opener[bot]" },
      },
    });
    vi.mocked(freshGithub.getOctokit).mockReturnValue({
      rest: { pulls: { get: getPr } },
    } as never);

    vi.spyOn(freshHealers, "registerHealer").mockImplementation(() => undefined);
    const evaluateSpy = vi
      .spyOn(freshGate, "evaluateGate")
      .mockResolvedValue(makeEvaluation({ commitSha: "target-head-sha" }));
    vi.spyOn(freshGate, "formatGateReport").mockReturnValue("## Report");

    await import("../main.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPr).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      pull_number: 99,
    });
    expect(evaluateSpy).toHaveBeenCalledWith(expect.any(Object), "target-head-sha", 99, {
      baseRef: "master",
      headRef: "promotion/train-28",
      labels: ["release-train", "urgent"],
      authorLogin: "train-opener[bot]",
    });
    expect(freshCore.setFailed).not.toHaveBeenCalled();
  });
});

/**
 * config.waitForChecks must reach evaluateGate as a genuine tri-state: an
 * explicit `wait-for-checks` input always wins, but leaving it unset must
 * pass through `undefined` rather than main.ts guessing a default here. The
 * default (waiting when the EFFECTIVE gate mode is release-ready) can only be
 * resolved once gate.ts has loaded .trailhead.yml — main.ts only ever sees
 * the raw, commonly-unset `gate-mode` input. See gate.ts's
 * waitForChecksEffective and its evaluate-gate.test.ts coverage for the
 * default itself; this only pins main.ts's side of the contract.
 */
describe("run — wait-for-checks passthrough to gate config", () => {
  async function runWithInputs(inputs: Record<string, string>) {
    vi.resetModules();

    const freshCore = await import("@actions/core");
    const freshGithub = await import("@actions/github");
    const freshHealers = await import("../healers/index.js");
    const freshGate = await import("../gate.js");

    vi.mocked(freshCore.getInput).mockImplementation(
      (name: string) => inputs[name] ?? "",
    );
    (
      freshGithub.context as {
        payload: { pull_request?: { number: number; head: { sha: string } } };
      }
    ).payload = {
      pull_request: { number: 42, head: { sha: "pr-head-sha-123" } },
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
    const evaluateSpy = vi
      .spyOn(freshGate, "evaluateGate")
      .mockResolvedValue(makeEvaluation());
    vi.spyOn(freshGate, "formatGateReport").mockReturnValue("## Report");

    await import("../main.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    return evaluateSpy;
  }

  it("passes undefined when wait-for-checks is left unset", async () => {
    const evaluateSpy = await runWithInputs({
      "github-token": "ghp_test",
      "disable-cloud-upsell": "true",
    });

    const passedConfig = evaluateSpy.mock.calls[0]?.[0] as { waitForChecks?: boolean };
    expect(passedConfig.waitForChecks).toBeUndefined();
  });

  it("passes true when wait-for-checks=true is explicit", async () => {
    const evaluateSpy = await runWithInputs({
      "github-token": "ghp_test",
      "disable-cloud-upsell": "true",
      "wait-for-checks": "true",
    });

    const passedConfig = evaluateSpy.mock.calls[0]?.[0] as { waitForChecks?: boolean };
    expect(passedConfig.waitForChecks).toBe(true);
  });

  it("passes false when wait-for-checks=false is explicit", async () => {
    const evaluateSpy = await runWithInputs({
      "github-token": "ghp_test",
      "disable-cloud-upsell": "true",
      "gate-mode": "release-ready",
      "wait-for-checks": "false",
    });

    const passedConfig = evaluateSpy.mock.calls[0]?.[0] as { waitForChecks?: boolean };
    expect(passedConfig.waitForChecks).toBe(false);
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
    evaluation?: GateEvaluation;
    updateOutcome?: boolean;
    fork?: boolean;
    eventName?: string;
    checkPublished?: boolean;
    supersededByRunId?: number;
    storeOutcome?: {
      stored: boolean;
      quotaExceeded: boolean;
      suspended: boolean;
      hardCapped: boolean;
    };
  }): Promise<{
    freshCore: typeof import("@actions/core");
    summaryText: string;
    updateCheckRunReportSpy: ReturnType<typeof vi.spyOn>;
    storeSpy?: ReturnType<typeof vi.spyOn>;
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
    (freshGithub.context as { eventName: string }).eventName =
      options.eventName ?? "pull_request";
    (
      freshGithub.context as {
        payload: {
          pull_request?: {
            number: number;
            head: { repo: { fork: boolean } };
          };
        };
      }
    ).payload = {
      pull_request: {
        number: 42,
        head: { repo: { fork: options.fork ?? false } },
      },
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
    vi.spyOn(freshGate, "evaluateGate").mockResolvedValue(
      options.evaluation ?? makeEvaluation(),
    );
    vi.spyOn(freshGate, "formatGateReport").mockImplementation((evaluation) => {
      const requiredCheck = evaluation.releaseBrief?.requiredCheck;
      if (!requiredCheck) return "## Report";
      const state = requiredCheck.published
        ? requiredCheck.reportRefreshed
          ? "published"
          : "published, report stale"
        : "not published";
      return `## Report\nRequired check ${state}`;
    });
    vi.spyOn(freshGate, "postPrComment").mockResolvedValue();
    vi.spyOn(freshGate, "createCheckRun").mockResolvedValue({
      published: options.checkPublished ?? true,
      name: "Trailhead — Release Ready",
      headSha: "abc123",
      ...(options.checkPublished === false ? {} : { checkRunId: 77 }),
      ...(options.supersededByRunId !== undefined
        ? { superseded: true, supersededByRunId: options.supersededByRunId }
        : {}),
    });
    const updateCheckRunReportSpy = vi
      .spyOn(freshGate, "updateCheckRunReport")
      .mockResolvedValue(options.updateOutcome ?? true);
    let storeSpy: ReturnType<typeof vi.spyOn> | undefined;
    if (options.storeOutcome) {
      storeSpy = vi
        .spyOn(freshNotify, "storeEvaluationDetailed")
        .mockResolvedValue(options.storeOutcome);
    }

    await import("../main.js");
    // run() is fired at import and never awaited by the module, and the D3
    // refresh path backs off between attempts — wait for the job summary,
    // which every successful run writes after publication and persistence.
    await vi.waitFor(() => expect(freshCore.summary.addRaw).toHaveBeenCalled(), {
      timeout: 5000,
    });

    const summaryText = vi
      .mocked(freshCore.summary.addRaw)
      .mock.calls.map((call) => call[0])
      .join("\n");

    return { freshCore, summaryText, updateCheckRunReportSpy, storeSpy };
  }

  it("refreshes D3 publication before persistence", async () => {
    const evaluation = makeEvaluation({
      gateMode: "release-ready",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });
    const { updateCheckRunReportSpy, storeSpy } = await runMain({
      inputs: {
        "api-key": "test-key",
        "github-token": "ghp_test",
        "trailhead-api-key": "th_live_abc",
        "disable-cloud-upsell": "true",
      },
      evaluation,
      storeOutcome: {
        stored: true,
        quotaExceeded: false,
        suspended: false,
        hardCapped: false,
      },
    });

    expect(updateCheckRunReportSpy).toHaveBeenCalledTimes(1);
    expect(evaluation.releaseBrief?.requiredCheck?.message).toContain(
      "token's publishing GitHub App",
    );
    expect(evaluation.releaseBrief?.requiredCheck?.reportRefreshed).toBe(true);
    expect(storeSpy).toBeDefined();
    expect(updateCheckRunReportSpy.mock.invocationCallOrder[0]).toBeLessThan(
      storeSpy!.mock.invocationCallOrder[0],
    );
  });

  it("discloses a published check whose report cannot be refreshed", async () => {
    const evaluation = makeEvaluation({
      gateMode: "release-ready",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });
    const { summaryText, updateCheckRunReportSpy, storeSpy } = await runMain({
      inputs: {
        "api-key": "test-key",
        "github-token": "ghp_test",
        "trailhead-api-key": "th_live_abc",
        "disable-cloud-upsell": "true",
      },
      evaluation,
      updateOutcome: false,
      storeOutcome: {
        stored: true,
        quotaExceeded: false,
        suspended: false,
        hardCapped: false,
      },
    });

    expect(updateCheckRunReportSpy).toHaveBeenCalledTimes(2);
    expect(storeSpy).toBeDefined();
    expect(updateCheckRunReportSpy.mock.invocationCallOrder[0]).toBeLessThan(
      storeSpy!.mock.invocationCallOrder[0],
    );
    expect(updateCheckRunReportSpy.mock.invocationCallOrder[1]).toBeLessThan(
      storeSpy!.mock.invocationCallOrder[0],
    );
    expect(evaluation.releaseBrief?.requiredCheck).toEqual(
      expect.objectContaining({
        published: true,
        reportRefreshed: false,
        message: expect.stringContaining("check body is stale"),
      }),
    );
    expect(summaryText).toContain("Required check published, report stale");
  });

  it("reports a superseded publish calmly, not as a branch-protection gap", async () => {
    const evaluation = makeEvaluation({
      gateMode: "release-ready",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });

    await runMain({
      inputs: { "github-token": "ghp_test", "disable-cloud-upsell": "true" },
      evaluation,
      checkPublished: false,
      supersededByRunId: 99,
    });

    const requiredCheck = evaluation.releaseBrief?.requiredCheck;
    expect(requiredCheck?.superseded).toBe(true);
    expect(requiredCheck?.message).toContain("run 99 already published");
    expect(requiredCheck?.message).toContain("No action needed");
    expect(requiredCheck?.message).not.toContain("cannot satisfy branch protection");
  });

  it("names the durable publisher path when a fork token cannot publish", async () => {
    const evaluation = makeEvaluation({
      gateMode: "release-ready",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });

    await runMain({
      inputs: {
        "github-token": "read-only-fork-token",
        "disable-cloud-upsell": "true",
      },
      evaluation,
      fork: true,
      checkPublished: false,
    });

    const message = evaluation.releaseBrief?.requiredCheck?.message ?? "";
    expect(message).toContain("fork `pull_request`");
    expect(message).toContain("`pull_request_target`");
    expect(message).toContain("installed GitHub App token");
    expect(message).toContain("cannot repair");
  });

  it("treats fork pull_request_review tokens as read-only", async () => {
    const evaluation = makeEvaluation({
      gateMode: "release-ready",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });

    await runMain({
      inputs: {
        "github-token": "read-only-fork-review-token",
        "disable-cloud-upsell": "true",
      },
      evaluation,
      fork: true,
      eventName: "pull_request_review",
      checkPublished: false,
    });

    const message = evaluation.releaseBrief?.requiredCheck?.message ?? "";
    expect(message).toContain("fork `pull_request_review`");
    expect(message).toContain("token is read-only");
    expect(message).toContain(
      "`pull_request_target` publisher does not receive review events",
    );
    expect(message).toContain("installed GitHub App or external publisher");
  });

  it("does not call a pull_request_target publisher token inherently read-only", async () => {
    const evaluation = makeEvaluation({
      gateMode: "release-ready",
      releaseReady: true,
      releaseBrief: {
        verdict: "allow",
        findings: [],
        inputs: [],
        actions: [],
        override: null,
      },
    });

    await runMain({
      inputs: {
        "github-token": "base-repo-token",
        "disable-cloud-upsell": "true",
      },
      evaluation,
      fork: true,
      eventName: "pull_request_target",
      checkPublished: false,
    });

    const message = evaluation.releaseBrief?.requiredCheck?.message ?? "";
    expect(message).toContain("Restore GitHub Checks access");
    expect(message).not.toContain("token is read-only");
  });

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

/**
 * ADR-011 §4 — availability stance, and §1's "silence is a bug": a run that could
 * not evaluate must still post a cannot-evaluate brief on the PR.
 */
describe("run — cannot-evaluate path (ADR-011 §1/§4)", () => {
  async function runFailedMain(options: {
    inputs: Record<string, string>;
    repoConfigContent?: string;
    stance?: "fail_open" | "fail_closed" | null;
    fork?: boolean;
    eventName?: string;
    checkPublished?: boolean;
    updateOutcome?: boolean;
    checkContract?: {
      name: string;
      mode: "risk-only" | "advisory" | "release-ready";
    } | null;
  }): Promise<{
    freshCore: typeof import("@actions/core");
    postPrCommentSpy: ReturnType<typeof vi.spyOn>;
    createCheckRunSpy: ReturnType<typeof vi.spyOn>;
    updateCheckRunReportSpy: ReturnType<typeof vi.spyOn>;
  }> {
    vi.resetModules();

    const freshCore = await import("@actions/core");
    const freshGithub = await import("@actions/github");
    const freshConfig = await import("../config.js");
    const freshConfigCore = await import("../config-core.js");
    const freshGate = await import("../gate.js");
    const freshHealers = await import("../healers/index.js");

    vi.mocked(freshCore.getInput).mockImplementation(
      (name: string) => options.inputs[name] ?? "",
    );
    (freshGithub.context as { eventName: string }).eventName =
      options.eventName ?? "pull_request";
    (
      freshGithub.context as {
        payload: {
          pull_request?: {
            number: number;
            head: { sha: string; repo: { fork: boolean } };
          };
        };
      }
    ).payload = {
      pull_request: {
        number: 42,
        head: {
          sha: "cannot-evaluate-head-sha",
          repo: { fork: options.fork ?? false },
        },
      },
    };

    if (options.repoConfigContent) {
      const repoConfig = freshConfigCore.parseRepoConfigContent(
        options.repoConfigContent,
      );
      if (!repoConfig) {
        throw new Error("runFailedMain received invalid repoConfigContent");
      }
      vi.spyOn(freshConfig, "loadRepoConfig").mockResolvedValue(repoConfig);
    }

    vi.spyOn(freshHealers, "registerHealer").mockImplementation(() => undefined);
    vi.spyOn(freshGate, "evaluateGate").mockRejectedValue(
      new Error("evaluation store unreachable"),
    );
    const postPrCommentSpy = vi.spyOn(freshGate, "postPrComment").mockResolvedValue();
    const createCheckRunSpy = vi.spyOn(freshGate, "createCheckRun").mockResolvedValue({
      published: options.checkPublished ?? true,
      name: "Trailhead — Release Ready",
      headSha: "cannot-evaluate-head-sha",
      ...(options.checkPublished === false ? {} : { checkRunId: 77 }),
    });
    const updateCheckRunReportSpy = vi
      .spyOn(freshGate, "updateCheckRunReport")
      .mockResolvedValue(options.updateOutcome ?? true);
    freshGate.setResolvedAvailabilityStance(options.stance ?? null);
    freshGate.setResolvedCheckContract(options.checkContract ?? null);

    await import("../main.js");
    await vi.waitFor(
      () => {
        const failed = vi.mocked(freshCore.setFailed).mock.calls.length > 0;
        const failOpenWarning = vi
          .mocked(freshCore.warning)
          .mock.calls.some(([message]) =>
            String(message).startsWith("Trailhead evaluation failed"),
          );
        expect(failed || failOpenWarning).toBe(true);
        // Generous: the D3 refresh path backs off between attempts.
      },
      { timeout: 5000 },
    );

    return {
      freshCore,
      postPrCommentSpy,
      createCheckRunSpy,
      updateCheckRunReportSpy,
    };
  }

  it("posts a cannot-evaluate brief and sets release-brief-json", async () => {
    const { freshCore, postPrCommentSpy, createCheckRunSpy, updateCheckRunReportSpy } =
      await runFailedMain({
        inputs: {
          "github-token": "ghp_test",
          "fail-mode": "open",
          "gate-mode": "release-ready",
        },
      });

    expect(postPrCommentSpy).toHaveBeenCalledTimes(1);
    const body = postPrCommentSpy.mock.calls[0]?.[0] as string;
    expect(body).toContain("CANNOT EVALUATE");
    expect(body).toContain("evaluation store unreachable");
    expect(body).toContain("Required check published");
    expect(createCheckRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gateDecision: "allow",
        releaseReady: true,
        gateMode: "release-ready",
      }),
      expect.stringContaining("CANNOT EVALUATE"),
      "ghp_test",
      "Trailhead — Release Ready",
    );
    expect(updateCheckRunReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ published: true, checkRunId: 77 }),
      expect.objectContaining({ releaseBrief: expect.any(Object) }),
      expect.stringContaining("Required check published"),
      "ghp_test",
    );
    expect(freshCore.setOutput).toHaveBeenCalledWith(
      "release-brief-json",
      expect.stringContaining('"verdict":"cannot_evaluate"'),
    );
    expect(freshCore.setFailed).not.toHaveBeenCalled();
  });

  it("gives fork-specific recovery when cannot-evaluate publication is denied", async () => {
    const { postPrCommentSpy, updateCheckRunReportSpy } = await runFailedMain({
      inputs: {
        "github-token": "read-only-fork-token",
        "fail-mode": "open",
        "gate-mode": "release-ready",
      },
      fork: true,
      eventName: "pull_request_review",
      checkPublished: false,
    });

    const body = postPrCommentSpy.mock.calls[0]?.[0] as string;
    expect(body).toContain("fork `pull_request_review`");
    expect(body).toContain(
      "`pull_request_target` publisher does not receive review events",
    );
    expect(body).toContain("installed GitHub App or external publisher");
    expect(body).toContain("cannot repair");
    expect(updateCheckRunReportSpy).not.toHaveBeenCalled();
  });

  it("discloses a stale cannot-evaluate check report after both refreshes fail", async () => {
    const { freshCore, postPrCommentSpy, updateCheckRunReportSpy } = await runFailedMain({
      inputs: {
        "github-token": "ghp_test",
        "fail-mode": "open",
        "gate-mode": "release-ready",
      },
      updateOutcome: false,
    });

    expect(updateCheckRunReportSpy).toHaveBeenCalledTimes(2);
    const body = postPrCommentSpy.mock.calls[0]?.[0] as string;
    expect(body).toContain("Required check published, report stale");
    expect(body).toContain("check body is stale");
    expect(freshCore.setOutput).toHaveBeenCalledWith(
      "release-brief-json",
      expect.stringContaining('"reportRefreshed":false'),
    );
  });

  it("posts a cannot-evaluate brief when the policy override is unusable", async () => {
    const { freshCore, postPrCommentSpy } = await runFailedMain({
      // An override with no reason/owner/ticket/expiry throws PolicyOverrideError
      // before evaluateGate is ever reached.
      inputs: {
        "github-token": "ghp_test",
        "fail-mode": "open",
        "override-risk-threshold": "90",
      },
    });

    expect(postPrCommentSpy).toHaveBeenCalledTimes(1);
    const body = postPrCommentSpy.mock.calls[0]?.[0] as string;
    expect(body).toContain("CANNOT EVALUATE");
    expect(body).toContain("Overrides require override-reason");
    expect(freshCore.setOutput).toHaveBeenCalledWith(
      "release-brief-json",
      expect.stringContaining('"verdict":"cannot_evaluate"'),
    );
    // The distinct failure message survives the new brief-posting path.
    expect(freshCore.setFailed).toHaveBeenCalledWith(
      "Invalid policy override: Overrides require override-reason, override-owner, " +
        "override-ticket, and override-expires-at",
    );
  });

  it("uses the repo-configured protected check when an override fails before evaluation", async () => {
    const { createCheckRunSpy } = await runFailedMain({
      inputs: {
        "github-token": "ghp_test",
        "override-risk-threshold": "90",
      },
      repoConfigContent: [
        "schema_version: 2",
        "gate:",
        "  mode: release-ready",
        '  check_name: "Trailhead Custom Contract"',
      ].join("\n"),
    });

    expect(createCheckRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gateMode: "release-ready",
        resolvedCheckName: "Trailhead Custom Contract",
      }),
      expect.stringContaining("CANNOT EVALUATE"),
      "ghp_test",
      "Trailhead Custom Contract",
    );
  });

  it("a fail_closed context stance overrides a fail-open action input", async () => {
    const { freshCore, createCheckRunSpy } = await runFailedMain({
      inputs: {
        "github-token": "ghp_test",
        "fail-mode": "open",
        "gate-mode": "release-ready",
      },
      checkContract: { name: "Custom Release Gate", mode: "release-ready" },
      stance: "fail_closed",
    });

    expect(freshCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("fail-closed"),
    );
    expect(createCheckRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({ gateDecision: "block", releaseReady: false }),
      expect.any(String),
      "ghp_test",
      "Custom Release Gate",
    );
  });

  it("a fail_open context stance overrides a fail-closed action input", async () => {
    const { freshCore } = await runFailedMain({
      inputs: { "github-token": "ghp_test", "fail-mode": "closed" },
      stance: "fail_open",
    });

    expect(freshCore.setFailed).not.toHaveBeenCalled();
    expect(freshCore.warning).toHaveBeenCalledWith(expect.stringContaining("fail-open"));
  });

  it("skips the PR comment in backfill mode but still sets the output", async () => {
    const { freshCore, postPrCommentSpy, createCheckRunSpy } = await runFailedMain({
      inputs: { "github-token": "ghp_test", "evaluate-pr": "99" },
    });

    expect(postPrCommentSpy).not.toHaveBeenCalled();
    expect(createCheckRunSpy).not.toHaveBeenCalled();
    expect(freshCore.setOutput).toHaveBeenCalledWith(
      "release-brief-json",
      expect.stringContaining('"verdict":"cannot_evaluate"'),
    );
  });

  it("never lets a comment-posting failure mask the original error", async () => {
    vi.resetModules();
    const freshCore = await import("@actions/core");
    const freshGithub = await import("@actions/github");
    const freshGate = await import("../gate.js");
    const freshHealers = await import("../healers/index.js");

    vi.mocked(freshCore.getInput).mockImplementation(
      (name: string) =>
        ({ "github-token": "ghp_test", "fail-mode": "closed" })[name] ?? "",
    );
    (freshGithub.context as { payload: { pull_request?: { number: number } } }).payload =
      {
        pull_request: { number: 42 },
      };
    vi.spyOn(freshHealers, "registerHealer").mockImplementation(() => undefined);
    vi.spyOn(freshGate, "evaluateGate").mockRejectedValue(new Error("boom"));
    vi.spyOn(freshGate, "postPrComment").mockRejectedValue(new Error("403 forbidden"));
    freshGate.setResolvedAvailabilityStance(null);

    await import("../main.js");
    await vi.waitFor(() =>
      expect(freshCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("boom")),
    );

    expect(freshCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("boom"));
    expect(freshCore.setFailed).toHaveBeenCalledTimes(1);
  });
});
