import type Stripe from "stripe";
import type { BillingStore, PaidPlan } from "trailhead-cloud";
import { encryptClaim } from "@/lib/claimCrypto";
import { isPaidPlan, planForPriceId } from "@/lib/plans";

const CLAIM_TTL_MS = 72 * 60 * 60 * 1000; // 72h, per contract key_claims.expires_at

export interface HandleResult {
  handled: boolean;
  reason?: string;
  orgId?: string;
}

/** `string | {id} | null` → id string. */
function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Org name from checkout email domain (per contract), falling back to the email. */
function orgNameFromEmail(email: string | null | undefined): string {
  if (!email) return "New org";
  const domain = email.split("@")[1];
  return domain && domain.length > 0 ? domain : email;
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const end = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === "number" ? new Date(end * 1000).toISOString() : null;
}

function planFromSubscription(sub: Stripe.Subscription): PaidPlan | undefined {
  const priceId = sub.items?.data?.[0]?.price?.id;
  return planForPriceId(priceId) ?? undefined;
}

/**
 * Core Stripe event handler — pure w.r.t. HTTP: takes a verified event + the
 * billing store and applies the contract's webhook flows. Kept separate from
 * the route so it can be unit-tested with a mocked store.
 *
 * Idempotency is insert-first: recordStripeEvent inserts into
 * stripe_webhook_events and a duplicate event id short-circuits (komatik lesson).
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  store: BillingStore,
): Promise<HandleResult> {
  const { firstSeen } = await store.recordStripeEvent({
    eventId: event.id,
    eventType: event.type,
    payload: event,
  });
  if (!firstSeen) {
    return { handled: false, reason: "duplicate" };
  }

  try {
    return await applyStripeEvent(event, store);
  } catch (err) {
    // Insert-first alone is a trap: the route 500s so Stripe retries, but the
    // retry would hit firstSeen=false and short-circuit as a duplicate — a
    // transient store failure would permanently drop the event (paid customer,
    // no org/key/claim ever created). Roll the ledger row back so the retry
    // can actually reprocess. Concurrent duplicate delivery is still deduped
    // by the insert; rollback only happens on handler failure.
    try {
      await store.removeStripeEvent(event.id);
    } catch (rollbackErr) {
      console.error(
        `[webhook] Ledger rollback failed for ${event.id} — event may be dropped until reconcile:`,
        rollbackErr,
      );
    }
    throw err;
  }
}

async function applyStripeEvent(
  event: Stripe.Event,
  store: BillingStore,
): Promise<HandleResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const plan = session.metadata?.plan;
      if (!isPaidPlan(plan)) {
        return { handled: false, reason: "missing_or_invalid_plan_metadata" };
      }
      const email =
        session.metadata?.email ??
        session.customer_email ??
        session.customer_details?.email ??
        null;
      const stripeCustomerId = idOf(session.customer);
      const stripeSubscriptionId = idOf(session.subscription);
      if (!stripeCustomerId || !stripeSubscriptionId) {
        return { handled: false, reason: "missing_customer_or_subscription" };
      }

      // Create org + org_settings.plan + subscriptions row + first api_key, all
      // in one store transaction. Precise status/current_period_end are synced
      // by the following customer.subscription.updated event (and reconcile).
      const { orgId, apiKeySecret } = await store.createOrgWithSubscription({
        orgName: orgNameFromEmail(email),
        plan,
        stripeCustomerId,
        stripeSubscriptionId,
        status: "active",
        currentPeriodEnd: null,
        keyLabel: "Initial key",
      });

      // Encrypt the plaintext key under TRAILHEAD_CLAIM_SECRET and stash the
      // one-time claim. Plaintext is never persisted (only key_hash + this
      // AES-256-GCM ciphertext).
      const keyCiphertext = encryptClaim(apiKeySecret);
      await store.createKeyClaim({
        checkoutSessionId: session.id,
        orgId,
        keyCiphertext,
        expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
      });

      return { handled: true, orgId };
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const res = await store.updateSubscriptionByStripeId(sub.id, {
        plan: planFromSubscription(sub),
        status: sub.status,
        currentPeriodEnd: periodEndIso(sub),
      });
      // Key suspend/unsuspend by status happens inside the store (single source
      // of truth), per contract flow 2.
      return { handled: true, orgId: res?.orgId };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const res = await store.updateSubscriptionByStripeId(sub.id, {
        status: "canceled",
        currentPeriodEnd: periodEndIso(sub),
      });
      return { handled: true, orgId: res?.orgId };
    }

    default:
      return { handled: false, reason: "ignored" };
  }
}
