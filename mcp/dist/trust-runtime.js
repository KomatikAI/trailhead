// Shadow / enforce runtime for agent trust injection (issue #259).
export function readTrustRuntime(env = process.env) {
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
