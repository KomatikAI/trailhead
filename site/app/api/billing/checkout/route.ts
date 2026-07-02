import { getStripeClient } from "@/lib/stripe";
import { guardRateLimit } from "@/lib/rateLimit";
import { isPaidPlan, priceIdForPlan } from "@/lib/plans";

/**
 * POST /api/billing/checkout  { plan: 'pro'|'team', email }
 * → Stripe Checkout Session (mode=subscription).
 *
 * Mirrors komatik/platform/web/app/api/teams/subscribe/route.ts:32-148
 * (assertStripeMode→503, rate-limit, price-by-env, metadata on session AND
 * subscription). No auth: possession-of-key is the v1 auth model, and the key
 * is issued post-payment — so checkout is public + rate-limited by IP.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://trailhead.komatik.xyz";
}

export async function POST(req: Request): Promise<Response> {
  // Rate limit first — cheap, and shields the Stripe API from abuse.
  const denied = guardRateLimit(req, "billing-checkout", 10);
  if (denied) return denied;

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (modeErr) {
    console.error("[checkout] Stripe mode assertion failed:", modeErr);
    return Response.json({ error: "Payment system unavailable" }, { status: 503 });
  }

  let body: { plan?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan, email } = body;
  if (!isPaidPlan(plan)) {
    return Response.json(
      { error: "plan must be 'pro' or 'team'" },
      { status: 400 },
    );
  }
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    console.error(`[checkout] No Stripe Price configured for plan '${plan}'`);
    return Response.json(
      { error: `Checkout for '${plan}' is not configured` },
      { status: 500 },
    );
  }

  const origin = siteUrl();
  const meta = { plan, email };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: meta,
      subscription_data: { metadata: meta },
      allow_promotion_codes: true,
      success_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
    });

    return Response.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("[checkout] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
