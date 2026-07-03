import pg from "pg";
import { createMemoryStore, createPgStore, type CloudStore } from "trailhead-cloud";

/**
 * The real `trailhead-cloud` package (cloud/src/types.ts) exposes a single
 * unified `CloudStore` interface — evaluation-ingest surface AND the billing
 * methods (createOrgWithSubscription, claimKey, etc.) folded into one. There
 * is no separate `BillingStore` export. `BillingStore` here is just a local
 * alias so the rest of the site's billing code can keep a billing-flavored
 * name without inventing a divergent shape.
 */
export type BillingStore = CloudStore;

/**
 * Billing store accessor for the site routes.
 *
 * Selection: Postgres store when DATABASE_URL is set (production/preview),
 * otherwise the in-memory store (local dev / tests inject their own mock).
 *
 * `createPgStore` (cloud/src/pg-store.ts) is synchronous and takes a `pg.Pool`
 * instance directly — NOT an async factory over `{ connectionString }` (that
 * shape only ever existed in the stale ambient .d.ts this module used to
 * resolve against). We own constructing the Pool here.
 */
let storePromise: Promise<BillingStore> | null = null;

export function getBillingStore(): Promise<BillingStore> {
  if (storePromise) return storePromise;

  const connectionString = process.env.DATABASE_URL;
  storePromise = connectionString
    ? Promise.resolve(createPgStore(new pg.Pool({ connectionString })))
    : Promise.resolve(createMemoryStore());

  return storePromise;
}

/** Test seam: inject a mock store (and reset between tests). */
export function __setBillingStoreForTest(store: BillingStore | null): void {
  storePromise = store ? Promise.resolve(store) : null;
}

/**
 * Portal: resolve a Bearer api key to its org's Stripe customer id.
 *
 * The real CloudStore has no single `getStripeCustomerIdForKey` method (that
 * was invented in the stale ambient .d.ts) — compose it from the two
 * primitives that do exist: resolve the key to its org, then look up that
 * org's subscription for the Stripe customer id.
 */
export async function resolveStripeCustomerIdForKey(
  store: BillingStore,
  apiKey: string,
): Promise<{ orgId: string; stripeCustomerId: string } | null> {
  const keyRecord = await store.getOrgForKey(apiKey);
  if (!keyRecord) return null;
  const subscription = await store.getSubscriptionForOrg(keyRecord.orgId);
  if (!subscription) return null;
  return { orgId: keyRecord.orgId, stripeCustomerId: subscription.stripeCustomerId };
}

/**
 * Reconcile: count of non-revoked keys for an org. The real CloudStore has no
 * `countActiveKeys` — `listManagedKeys` already filters to `revoked_at IS
 * NULL` (see cloud/src/pg-store.ts), so its length is exactly that count.
 */
export async function countActiveKeys(
  store: BillingStore,
  orgId: string,
): Promise<number> {
  const keys = await store.listManagedKeys(orgId);
  return keys.length;
}
