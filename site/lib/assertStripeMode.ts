/**
 * Stripe live/test mode safety guard.
 *
 * Mirrors komatik/platform/web/lib/stripe/assertMode.ts (assertStripeMode /
 * isProductionEnvironment / detectStripeMode). Call inside every Stripe SDK
 * factory before constructing the client so a misconfigured env cannot process
 * real payments against test infra (or vice versa).
 */
export type StripeMode = "live" | "test";

export interface AssertStripeModeOptions {
  forceProduction?: boolean;
}

/** Prefer Vercel's VERCEL_ENV=production; fall back to NODE_ENV. */
export function isProductionEnvironment(opts: AssertStripeModeOptions = {}): boolean {
  if (opts.forceProduction) return true;
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function detectStripeMode(secretKey: string | undefined | null): StripeMode | null {
  if (!secretKey) return null;
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) return "live";
  if (secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_")) return "test";
  return null;
}

/**
 * Assert that the Stripe secret key matches the current environment.
 * Throws (wrap in a 503) when prod+test, prod+missing/unknown, or non-prod+live.
 */
export function assertStripeMode(
  secretKey: string | undefined | null,
  opts: AssertStripeModeOptions = {},
): void {
  const inProd = isProductionEnvironment(opts);
  const mode = detectStripeMode(secretKey);

  if (inProd) {
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY missing in production environment");
    }
    if (mode === "test") {
      throw new Error(
        "REFUSING TO RUN: sk_test_ key detected in production. Set sk_live_ in Vercel production env.",
      );
    }
    if (mode === null) {
      throw new Error("STRIPE_SECRET_KEY has unrecognized prefix in production environment");
    }
    return;
  }

  if (mode === "live") {
    throw new Error(
      "REFUSING TO RUN: sk_live_ key detected outside production. Use sk_test_ in dev/preview/staging.",
    );
  }
}
