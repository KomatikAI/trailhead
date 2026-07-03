export interface TrustRuntime {
    enabled: boolean;
    /** Log trust profile without applying threshold delta. */
    shadow: boolean;
    /** Apply threshold delta and strictness adjustments from trust score. */
    enforce: boolean;
    /** Collector-only: inject TRAILHEAD_AGENT_TRUST_JSON (Komatik dogfood). */
    injectTrustJson: boolean;
}
export declare function readTrustRuntime(env?: NodeJS.ProcessEnv): TrustRuntime;
