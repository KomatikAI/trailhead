import type { GateEvaluation } from "./types.js";
export declare const LEGACY_WEBHOOK_EVENTS: readonly ["allow", "warn", "block"];
export type LegacyWebhookEvent = (typeof LEGACY_WEBHOOK_EVENTS)[number];
export declare const TRAILHEAD_EVENT_TYPES: readonly ["trailhead.blocked", "trailhead.warn_high_risk", "trailhead.ready", "trailhead.loop_exceeded", "trailhead.override_applied"];
export type TrailheadEventType = (typeof TRAILHEAD_EVENT_TYPES)[number];
export type WebhookEventName = LegacyWebhookEvent | TrailheadEventType;
export interface WebhookDelivery {
    event: WebhookEventName;
    kind: "legacy" | "trailhead";
}
export interface ResolveTrailheadEventsOptions {
    riskThreshold?: number;
    warnThreshold?: number;
}
export declare function parseWebhookEvents(input: string): Set<string>;
export declare function isTrailheadEventType(value: string): value is TrailheadEventType;
export declare function isLegacyWebhookEvent(value: string): value is LegacyWebhookEvent;
export declare function resolveTrailheadEventTypes(evaluation: GateEvaluation, options?: ResolveTrailheadEventsOptions): TrailheadEventType[];
export declare function resolveWebhookDeliveries(evaluation: GateEvaluation, subscribed: Set<string>, options?: ResolveTrailheadEventsOptions): WebhookDelivery[];
export declare function evaluationMatchesTrailheadEvent(evaluation: GateEvaluation, event: TrailheadEventType, options?: ResolveTrailheadEventsOptions): boolean;
