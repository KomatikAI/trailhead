import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { getBillingStore } from "@/lib/cloudStore";
import { handleStripeEvent } from "@/lib/webhookHandlers";

/**
 * POST /api/billing/webhook — Stripe event sink.
 *
 * Mirrors komatik/platform/web/app/api/tier-purchase/webhook/route.ts:11-58
 * (raw body → signature header → assertStripeMode → constructEvent), then
 * delegates to handleStripeEvent (idempotent via stripe_webhook_events).
 *
 * MUST read the raw body for signature verification — do not parse JSON first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (modeErr) {
    console.error("[webhook] Stripe mode assertion failed:", modeErr);
    return Response.json({ error: "Payment system misconfigured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const store = await getBillingStore();
    const result = await handleStripeEvent(event, store);
    return Response.json({ received: true, ...result });
  } catch (err) {
    // Return 500 so Stripe retries — the insert-first ledger makes replay safe.
    console.error(`[webhook] Handler error for ${event.type} (${event.id}):`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Handler error" },
      { status: 500 },
    );
  }
}
