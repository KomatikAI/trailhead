import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { getBillingStore } from "@/lib/cloudStore";
import { ownedPriceIds, planForPriceId, type PaidPlan } from "@/lib/plans";

/**
 * GET /api/billing/reconcile  (Authorization: Bearer <CRON_SECRET>)
 * Daily Vercel cron (vercel.json: "0 7 * * *"). komatik lesson — no
 * fire-and-forget: Stripe is the source of truth, and drift is repaired here.
 *
 * Per contract flow 5:
 *  - list Stripe subscriptions for OUR products (price ids we own)
 *  - missing local row      → repair from Stripe truth (upsertSubscriptionFromStripe)
 *  - status/plan/period drift → resync (updateSubscriptionByStripeId)
 *  - active sub, zero active keys → needs_attention log line
 *  - purge expired unclaimed key_claims
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const end = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === "number" ? new Date(end * 1000).toISOString() : null;
}

function planOf(sub: Stripe.Subscription): PaidPlan | null {
  return planForPriceId(sub.items?.data?.[0]?.price?.id) ?? null;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const secret = process.env.CRON_SECRET;
  if (!secret || token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (modeErr) {
    console.error("[reconcile] Stripe mode assertion failed:", modeErr);
    return Response.json({ error: "Payment system unavailable" }, { status: 503 });
  }

  const owned = new Set(ownedPriceIds());
  const store = await getBillingStore();

  const localRows = await store.listSubscriptions();
  const localByStripeId = new Map(localRows.map((r) => [r.stripeSubscriptionId, r]));

  const summary = { scanned: 0, repaired: 0, resynced: 0, needsAttention: 0, claimsPurged: 0 };

  try {
    // Walk all Stripe subscriptions; keep only those on a Price we own.
    for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
      const plan = planOf(sub);
      const priceId = sub.items?.data?.[0]?.price?.id;
      if (!plan || !priceId || !owned.has(priceId)) continue;

      summary.scanned += 1;
      const stripeCustomerId = idOf(sub.customer);
      if (!stripeCustomerId) continue;
      const currentPeriodEnd = periodEndIso(sub);

      const local = localByStripeId.get(sub.id);
      if (!local) {
        // Missing locally — repair from Stripe truth.
        const { orgId } = await store.upsertSubscriptionFromStripe({
          stripeCustomerId,
          stripeSubscriptionId: sub.id,
          plan,
          status: sub.status,
          currentPeriodEnd,
        });
        summary.repaired += 1;
        console.warn(
          `[reconcile] repaired missing subscription ${sub.id} → org ${orgId} (${plan}/${sub.status})`,
        );
      } else if (
        local.status !== sub.status ||
        local.plan !== plan ||
        local.currentPeriodEnd !== currentPeriodEnd
      ) {
        // Drift — resync (this also fixes key suspend/unsuspend inside the store).
        await store.updateSubscriptionByStripeId(sub.id, {
          plan,
          status: sub.status,
          currentPeriodEnd,
        });
        summary.resynced += 1;
        console.warn(
          `[reconcile] resynced ${sub.id}: ${local.status}→${sub.status}, ${local.plan}→${plan}`,
        );
      }

      // Active sub but no usable key → flag for attention (contract flow 5).
      if (ACTIVE_STATUSES.has(sub.status)) {
        const row = local ?? (await store.getSubscriptionByStripeId(sub.id));
        if (row) {
          const keys = await store.countActiveKeys(row.orgId);
          if (keys === 0) {
            summary.needsAttention += 1;
            console.warn(
              `[reconcile] needs_attention: org ${row.orgId} has active sub ${sub.id} but 0 active keys`,
            );
          }
        }
      }
    }

    summary.claimsPurged = await store.purgeExpiredClaims();
  } catch (err) {
    console.error("[reconcile] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Reconcile failed", partial: summary },
      { status: 500 },
    );
  }

  console.log("[reconcile] complete", summary);
  return Response.json({ ok: true, ...summary });
}
