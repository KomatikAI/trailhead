import type Stripe from "stripe";
import type { BillingStore } from "@/lib/cloudStore";
import { encryptClaim } from "@/lib/claimCrypto";
import { isPaidPlan, planForPriceId, type PaidPlan } from "@/lib/plans";

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
  const end =
    sub.items?.data?.[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
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
 * Mark events processed only AFTER their effects succeed. Checkout fulfillment
 * is atomic and session-idempotent; subscription updates are idempotent writes.
 * A crash must never leave a completed ledger entry with missing effects.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  store: BillingStore,
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>,
): Promise<HandleResult> {
  if (await store.hasStripeEvent(event.id)) {
    return { handled: false, reason: "duplicate" };
  }

  const result = await applyStripeEvent(event, store, retrieveSubscription);
  await store.recordStripeEvent(event.id, event.type, event);
  return result;
}

async function applyStripeEvent(
  event: Stripe.Event,
  store: BillingStore,
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>,
): Promise<HandleResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (
        session.payment_status !== "paid" &&
        session.payment_status !== "no_payment_required"
      ) {
        return { handled: false, reason: "payment_pending" };
      }
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

      // Events can arrive out of order. A delayed Checkout must not resurrect
      // paid access after cancellation or overwrite a newer plan with metadata.
      const sub = await retrieveSubscription(stripeSubscriptionId);
      if (idOf(sub.customer) !== stripeCustomerId) {
        throw new Error("Checkout subscription customer mismatch");
      }
      const currentPlan = planFromSubscription(sub);
      if (!currentPlan) throw new Error("Unrecognized subscription price");

      // Create org + subscription + key + encrypted claim atomically, using
      // Stripe's current state rather than assuming a later event will fix it.
      const orgId = await store.fulfillCheckout(
        {
          orgName: orgNameFromEmail(email),
          plan: currentPlan,
          stripeCustomerId,
          stripeSubscriptionId,
          status: sub.status,
          currentPeriodEnd: periodEndIso(sub),
          keyLabel: "Initial key",
        },
        {
          sessionId: session.id,
          expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
          encryptKey: encryptClaim,
        },
      );

      return { handled: true, orgId };
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const snapshot = event.data.object as Stripe.Subscription;
      const sub = await retrieveSubscription(snapshot.id);
      const orgId = await store.updateSubscriptionByStripeId(sub.id, {
        plan: planFromSubscription(sub),
        status: sub.status,
        currentPeriodEnd: periodEndIso(sub),
      });
      // Key suspend/unsuspend by status happens inside the store (single source
      // of truth), per contract flow 2.
      return { handled: true, orgId: orgId ?? undefined };
    }

    default:
      return { handled: false, reason: "ignored" };
  }
}
