import { createHash } from "node:crypto";
export const PLANS = {
    free: {
        id: "free",
        name: "Free",
        evaluationsPerMonth: 0,
        cloudStore: false,
        dashboard: false,
        orgRollup: false,
        apiKeys: false,
        sso: false,
        seatsIncluded: 1,
    },
    pro: {
        id: "pro",
        name: "Pro",
        evaluationsPerMonth: 5_000,
        cloudStore: true,
        dashboard: true,
        orgRollup: false,
        apiKeys: true,
        sso: false,
        seatsIncluded: 3,
    },
    team: {
        id: "team",
        name: "Team",
        evaluationsPerMonth: 50_000,
        cloudStore: true,
        dashboard: true,
        orgRollup: true,
        apiKeys: true,
        sso: true,
        seatsIncluded: 10,
    },
};
export function monthKey(date = new Date()) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function quotaHeaders(plan, used) {
    const limit = PLANS[plan].evaluationsPerMonth;
    const remaining = Math.max(0, limit - used);
    return {
        "X-Trailhead-Plan": plan,
        "X-Trailhead-Quota-Limit": String(limit),
        "X-Trailhead-Quota-Used": String(used),
        "X-Trailhead-Quota-Remaining": String(remaining),
    };
}
export function canIngestEvaluation(plan, used) {
    if (!PLANS[plan].cloudStore)
        return false;
    return used < PLANS[plan].evaluationsPerMonth;
}
/**
 * Soft-launch quota multiplier: over-quota ingest is still stored (200 +
 * `X-Trailhead-Quota-Exceeded`) up to HARD_LIMIT_MULTIPLIER × the tier limit,
 * then hard-stopped (429). Fail-closed abuse backstop (komatik lesson).
 */
export const HARD_LIMIT_MULTIPLIER = 3;
/**
 * Decide how to treat an ingest given the org's plan and its usage BEFORE this
 * evaluation is counted. Encodes the v1 soft-launch quota semantics.
 */
export function evaluateQuota(plan, usedBeforeInsert) {
    const def = PLANS[plan];
    if (!def.cloudStore) {
        return { planAllowsCloud: false, store: false, overQuota: true, hardLimited: false };
    }
    const limit = def.evaluationsPerMonth;
    const hardCap = limit * HARD_LIMIT_MULTIPLIER;
    const overQuota = usedBeforeInsert >= limit;
    const hardLimited = usedBeforeInsert >= hardCap;
    return {
        planAllowsCloud: true,
        store: !hardLimited,
        overQuota,
        hardLimited,
    };
}
/** sha256 hex of the full API key. PLAINTEXT IS NEVER STORED (contract). */
export function hashApiKey(key) {
    return createHash("sha256").update(key).digest("hex");
}
export function maskApiKey(key) {
    if (key.length <= 8)
        return "thk_****";
    return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
export function generateApiKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `thk_${hex}`;
}
