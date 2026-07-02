import { describe, expect, it } from "vitest";
import {
  canIngestEvaluation,
  evaluateQuota,
  hashApiKey,
  HARD_LIMIT_MULTIPLIER,
  maskApiKey,
  PLANS,
  quotaHeaders,
} from "./billing.js";

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

  it("hashes api keys to sha256 hex (deterministic, never the plaintext)", () => {
    const key = "thk_deadbeef";
    const hash = hashApiKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(key);
    expect(hashApiKey(key)).toBe(hash);
    expect(hashApiKey("thk_other")).not.toBe(hash);
  });

  it("evaluateQuota encodes soft-launch → 3× hard-stop semantics", () => {
    const limit = PLANS.pro.evaluationsPerMonth; // 5000
    const hard = limit * HARD_LIMIT_MULTIPLIER; // 15000

    // Under limit: normal.
    expect(evaluateQuota("pro", 0)).toEqual({
      planAllowsCloud: true,
      store: true,
      overQuota: false,
      hardLimited: false,
    });
    expect(evaluateQuota("pro", limit - 1).overQuota).toBe(false);

    // At/over limit but under 3×: soft over-quota — still stored.
    expect(evaluateQuota("pro", limit)).toEqual({
      planAllowsCloud: true,
      store: true,
      overQuota: true,
      hardLimited: false,
    });
    expect(evaluateQuota("pro", hard - 1)).toMatchObject({
      store: true,
      overQuota: true,
      hardLimited: false,
    });

    // At/over 3×: hard stop — not stored.
    expect(evaluateQuota("pro", hard)).toEqual({
      planAllowsCloud: true,
      store: false,
      overQuota: true,
      hardLimited: true,
    });

    // Free: cloud store not permitted at all.
    expect(evaluateQuota("free", 0)).toEqual({
      planAllowsCloud: false,
      store: false,
      overQuota: true,
      hardLimited: false,
    });
  });
});
