import { describe, expect, it } from "vitest";
import { canIngestEvaluation, maskApiKey, PLANS, quotaHeaders } from "./billing.js";

describe("billing", () => {
  it("defines marketplace tiers", () => {
    expect(PLANS.free.cloudStore).toBe(false);
    expect(PLANS.pro.cloudStore).toBe(true);
    expect(PLANS.team.orgRollup).toBe(true);
    expect(PLANS.team.sso).toBe(true);
  });

  it("blocks free tier cloud ingest", () => {
    expect(canIngestEvaluation("free", 0)).toBe(false);
    expect(canIngestEvaluation("pro", 0)).toBe(true);
  });

  it("emits quota headers", () => {
    expect(quotaHeaders("pro", 100)).toEqual({
      "X-Trailhead-Plan": "pro",
      "X-Trailhead-Quota-Limit": "5000",
      "X-Trailhead-Quota-Used": "100",
      "X-Trailhead-Quota-Remaining": "4900",
    });
  });

  it("masks api keys for display", () => {
    expect(maskApiKey("thk_abcdef1234567890")).toMatch(/^thk_abc…/);
  });
});
