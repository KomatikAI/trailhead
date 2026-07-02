import { getStripeClient } from "@/lib/stripe";
import { getBillingStore } from "@/lib/cloudStore";
import { guardRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/billing/portal  (Authorization: Bearer <api key>)
 * → Stripe billing-portal session for the key's org.
 *
 * v1 auth is possession-of-key: resolve the Bearer key to its org's Stripe
 * customer id, then mint a portal session. No login system (contract §Auth v1).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://trailhead.komatik.xyz";
}

export async function POST(req: Request): Promise<Response> {
  const denied = guardRateLimit(req, "billing-portal", 20);
  if (denied) return denied;

  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) {
    return Response.json({ error: "Missing Authorization bearer token" }, { status: 401 });
  }

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (modeErr) {
    console.error("[portal] Stripe mode assertion failed:", modeErr);
    return Response.json({ error: "Payment system unavailable" }, { status: 503 });
  }

  const store = await getBillingStore();
  const resolved = await store.getStripeCustomerIdForKey(key);
  if (!resolved) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: resolved.stripeCustomerId,
      return_url: `${siteUrl()}/dashboard`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[portal] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create portal session" },
      { status: 500 },
    );
  }
}
