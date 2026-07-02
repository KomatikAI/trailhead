/**
 * Plan → Stripe Price mapping. Prices live in env (never hardcoded ids), per
 * the mount contract. Pricing hypotheses: Pro $39/mo, Team $399/mo.
 */
export type PaidPlan = "pro" | "team";

export const PAID_PLANS: readonly PaidPlan[] = ["pro", "team"] as const;

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "pro" || value === "team";
}

/** Resolve the Stripe Price id for a plan from env. Returns undefined if unset. */
export function priceIdForPlan(plan: PaidPlan): string | undefined {
  return plan === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_TEAM;
}

/** Reverse map: which of our plans does this Stripe Price id represent? */
export function planForPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_TEAM) return "team";
  return null;
}

/** The Stripe Price ids we own — used by reconcile to scope Stripe listing. */
export function ownedPriceIds(): string[] {
  return [process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_TEAM].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}
