import { describe, expect, it } from "vitest";
import { readTrustRuntime } from "../trust-runtime.js";

describe("trust-runtime", () => {
  it("defaults to enforce mode for backward-compatible gate behavior", () => {
    const runtime = readTrustRuntime({});
    expect(runtime.enabled).toBe(true);
    expect(runtime.shadow).toBe(false);
    expect(runtime.enforce).toBe(true);
    expect(runtime.injectTrustJson).toBe(false);
  });

  it("enters shadow mode only when TRAILHEAD_TRUST_SHADOW=true", () => {
    const runtime = readTrustRuntime({
      TRAILHEAD_TRUST_SHADOW: "true",
    });
    expect(runtime.shadow).toBe(true);
    expect(runtime.enforce).toBe(false);
  });

  it("enables collector injection when TRAILHEAD_TRUST_ENFORCE=true", () => {
    const runtime = readTrustRuntime({
      TRAILHEAD_TRUST_ENFORCE: "true",
    });
    expect(runtime.enforce).toBe(true);
    expect(runtime.injectTrustJson).toBe(true);
  });

  it("disables all trust paths when kill switch is set", () => {
    const runtime = readTrustRuntime({
      TRAILHEAD_TRUST_ENABLED: "false",
      TRAILHEAD_TRUST_ENFORCE: "true",
    });
    expect(runtime.enabled).toBe(false);
    expect(runtime.enforce).toBe(false);
    expect(runtime.injectTrustJson).toBe(false);
  });
});
