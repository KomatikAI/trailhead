// Pure Trailhead semantic event resolution — no framework dependencies.
// Maps gate evaluations to coordinator-friendly webhook event types.

import type { GateEvaluation } from "./types.js";

export const LEGACY_WEBHOOK_EVENTS = ["allow", "warn", "block"] as const;
export type LegacyWebhookEvent = (typeof LEGACY_WEBHOOK_EVENTS)[number];

export const TRAILHEAD_EVENT_TYPES = [
  "trailhead.blocked",
  "trailhead.warn_high_risk",
  "trailhead.ready",
  "trailhead.loop_exceeded",
] as const;
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

export function parseWebhookEvents(input: string): Set<string> {
  return new Set(
    input
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function isTrailheadEventType(value: string): value is TrailheadEventType {
  return (TRAILHEAD_EVENT_TYPES as readonly string[]).includes(value);
}

export function isLegacyWebhookEvent(value: string): value is LegacyWebhookEvent {
  return (LEGACY_WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export function resolveTrailheadEventTypes(
  evaluation: GateEvaluation,
  options: ResolveTrailheadEventsOptions = {},
): TrailheadEventType[] {
  const events: TrailheadEventType[] = [];
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

  return events;
}

export function resolveWebhookDeliveries(
  evaluation: GateEvaluation,
  subscribed: Set<string>,
  options: ResolveTrailheadEventsOptions = {},
): WebhookDelivery[] {
  const deliveries: WebhookDelivery[] = [];

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

export function evaluationMatchesTrailheadEvent(
  evaluation: GateEvaluation,
  event: TrailheadEventType,
  options: ResolveTrailheadEventsOptions = {},
): boolean {
  return resolveTrailheadEventTypes(evaluation, options).includes(event);
}
