// Pure Trailhead semantic event resolution — no framework dependencies.
// Maps gate evaluations to coordinator-friendly webhook event types.
export const LEGACY_WEBHOOK_EVENTS = ["allow", "warn", "block"];
export const TRAILHEAD_EVENT_TYPES = [
    "trailhead.blocked",
    "trailhead.warn_high_risk",
    "trailhead.ready",
    "trailhead.loop_exceeded",
    "trailhead.override_applied",
];
export function parseWebhookEvents(input) {
    return new Set(input
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean));
}
export function isTrailheadEventType(value) {
    return TRAILHEAD_EVENT_TYPES.includes(value);
}
export function isLegacyWebhookEvent(value) {
    return LEGACY_WEBHOOK_EVENTS.includes(value);
}
export function resolveTrailheadEventTypes(evaluation, options = {}) {
    const events = [];
    const effectiveRiskThreshold = options.riskThreshold ?? 70;
    const highRiskCutoff = effectiveRiskThreshold - 10;
    if (evaluation.gateDecision === "block") {
        events.push("trailhead.blocked");
    }
    if (evaluation.gateDecision === "warn" && evaluation.riskScore >= highRiskCutoff) {
        events.push("trailhead.warn_high_risk");
    }
    if (evaluation.releaseReady === true) {
        events.push("trailhead.ready");
    }
    if (evaluation.remediation?.next_action === "max_rounds_exceeded") {
        events.push("trailhead.loop_exceeded");
    }
    if (evaluation.policyOverride?.source === "label") {
        events.push("trailhead.override_applied");
    }
    return events;
}
export function resolveWebhookDeliveries(evaluation, subscribed, options = {}) {
    const deliveries = [];
    if (subscribed.has(evaluation.gateDecision)) {
        deliveries.push({ event: evaluation.gateDecision, kind: "legacy" });
    }
    for (const event of resolveTrailheadEventTypes(evaluation, options)) {
        if (subscribed.has(event)) {
            deliveries.push({ event, kind: "trailhead" });
        }
    }
    return deliveries;
}
export function evaluationMatchesTrailheadEvent(evaluation, event, options = {}) {
    return resolveTrailheadEventTypes(evaluation, options).includes(event);
}
