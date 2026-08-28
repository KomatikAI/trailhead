import { describe, expect, it, vi } from "vitest";

const baseOptions = {
  riskThreshold: 70,
  healthCheckUrls: [],
  doraMetrics: false,
  doraEnvironment: "",
  otelEndpoint: "",
  evaluationStoreUrl: "",
  storeSecretName: "",
  supabaseFallback: false,
  securityGate: true,
  environment: "",
  gateMode: "release-ready" as const,
  waitForChecks: true,
};

describe("generated Trailhead workflow", () => {
  async function generateWorkflowYml(
    options: typeof baseOptions & { rerunOnReview: boolean },
  ) {
    const generators = await vi.importActual<{
      generateWorkflowYml: (value: typeof options) => string;
    }>("../../cli/src/generators.js");
    return generators.generateWorkflowYml(options);
  }

  it("reruns agent approval policy when a review changes", async () => {
    const workflow = generateWorkflowYml({ ...baseOptions, rerunOnReview: true });

    await expect(workflow).resolves.toContain(
      "  pull_request_review:\n    types: [submitted, dismissed]",
    );
  });

  it("re-evaluates only override label activity", async () => {
    const workflow = await generateWorkflowYml({
      ...baseOptions,
      rerunOnReview: false,
    });

    expect(workflow).toContain(
      "types: [opened, synchronize, reopened, labeled, unlabeled]",
    );
    expect(workflow).toContain(
      "    if: >-\n" +
        "      (github.event.action != 'labeled' && github.event.action != 'unlabeled') ||\n" +
        "      github.event.label.name == 'trailhead-override'",
    );
    expect(workflow).toContain(
      "group: trailhead-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ " +
        "((github.event.action == 'labeled' || github.event.action == 'unlabeled') && " +
        "github.event.label.name != 'trailhead-override') && github.run_id || 'gate' }}",
    );
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("does not add review runs when approval policy is disabled", async () => {
    const workflow = generateWorkflowYml({ ...baseOptions, rerunOnReview: false });

    await expect(workflow).resolves.not.toContain("pull_request_review:");
  });

  it.each([
    ["risk-only", "Trailhead"],
    ["advisory", "Trailhead — Release Ready"],
    ["release-ready", "Trailhead — Release Ready"],
  ] as const)(
    "names the actual %s custom check in wizard branch-protection guidance",
    async (gateMode, expectedName) => {
      const generators = await vi.importActual<{
        requiredCheckNameForGateMode: (mode: typeof gateMode) => string;
      }>("../../cli/src/generators.js");

      expect(generators.requiredCheckNameForGateMode(gateMode)).toBe(expectedName);
    },
  );
});
