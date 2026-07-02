import Stripe from "stripe";
import { assertStripeMode } from "@/lib/assertStripeMode";

/**
 * Pinned Stripe API version — matches komatik/platform/web (teams/subscribe).
 * Bump deliberately, never float, so webhook payload shapes stay stable.
 */
export const STRIPE_API_VERSION = "2026-02-25.clover" as Stripe.LatestApiVersion;

/**
 * Construct a mode-guarded Stripe client. Throws if STRIPE_SECRET_KEY is
 * missing or mismatched with the environment — callers map that to a 503.
 */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  assertStripeMode(key);
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
