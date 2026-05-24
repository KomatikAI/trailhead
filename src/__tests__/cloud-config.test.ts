import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CLOUD_API_BASE,
  resolveCloudApiBase,
  resolveDeployEventsUrl,
  resolveEvaluationStoreUrl,
} from "../cloud-config.js";

describe("cloud-config", () => {
  afterEach(() => {
    delete process.env.TRAILHEAD_CLOUD_API_BASE;
  });

  it("uses default cloud API base", () => {
    expect(resolveCloudApiBase()).toBe(DEFAULT_CLOUD_API_BASE);
  });

  it("respects TRAILHEAD_CLOUD_API_BASE override", () => {
    process.env.TRAILHEAD_CLOUD_API_BASE = "https://cloud.example.com/";
    expect(resolveCloudApiBase()).toBe("https://cloud.example.com");
  });

  it("prefers explicit evaluation-store-url over trailhead-api-key", () => {
    expect(
      resolveEvaluationStoreUrl({
        evaluationStoreUrl: "https://custom.example/store",
        trailheadApiKey: "thk_test",
      }),
    ).toBe("https://custom.example/store");
  });

  it("derives store URL from trailhead-api-key", () => {
    expect(
      resolveEvaluationStoreUrl({
        trailheadApiKey: "thk_test",
      }),
    ).toBe(`${DEFAULT_CLOUD_API_BASE}/v1/evaluations`);
  });

  it("returns undefined when neither url nor key is set", () => {
    expect(resolveEvaluationStoreUrl({})).toBeUndefined();
  });

  it("maps cloud evaluation URL to deploy-events", () => {
    expect(resolveDeployEventsUrl("https://api.trailhead.dev/v1/evaluations")).toBe(
      "https://api.trailhead.dev/v1/deploy-events",
    );
  });

  it("maps legacy BYOS store URL to deploy-event", () => {
    expect(resolveDeployEventsUrl("https://myapp.com/api/trailhead/store")).toBe(
      "https://myapp.com/api/trailhead/deploy-event",
    );
  });
});
