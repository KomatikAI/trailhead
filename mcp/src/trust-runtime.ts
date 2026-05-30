// Shadow / enforce runtime for agent trust injection (issue #259).

export interface TrustRuntime {
  enabled: boolean;
  /** Log trust profile without applying threshold delta. */
  shadow: boolean;
  /** Apply threshold delta and strictness adjustments from trust score. */
  enforce: boolean;
  /** Collector-only: inject TRAILHEAD_AGENT_TRUST_JSON (Komatik dogfood). */
  injectTrustJson: boolean;
}

export function readTrustRuntime(env: NodeJS.ProcessEnv = process.env): TrustRuntime {
  const enabled = env.TRAILHEAD_TRUST_ENABLED !== "false";
  const shadow = enabled && env.TRAILHEAD_TRUST_SHADOW === "true";
  const enforce = enabled && !shadow;

  return {
    enabled,
    shadow,
    enforce,
    injectTrustJson: enabled && env.TRAILHEAD_TRUST_ENFORCE === "true",
  };
}
