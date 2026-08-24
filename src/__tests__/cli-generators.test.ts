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

  it("does not add review runs when approval policy is disabled", async () => {
    const workflow = generateWorkflowYml({ ...baseOptions, rerunOnReview: false });

    await expect(workflow).resolves.not.toContain("pull_request_review:");
  });
});
