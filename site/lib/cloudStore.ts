import {
  createMemoryStore,
  createPgStore,
  type BillingStore,
} from "trailhead-cloud";

/**
 * Billing store accessor for the site routes.
 *
 * ── TODO(merge, Lane A: feat/cloud-pg-store) ──────────────────────────────
 * `createPgStore` + the async `BillingStore` surface are being built on Lane A
 * in parallel; on this branch they resolve against the ambient declaration in
 * `site/types/trailhead-cloud.d.ts`. When Lane A merges, this module should
 * "just work" against the real cloud exports — delete the ambient .d.ts and
 * verify the method signatures line up.
 *
 * Selection: Postgres store when DATABASE_URL is set (production/preview),
 * otherwise the in-memory store (local dev / tests inject their own mock).
 */
let storePromise: Promise<BillingStore> | null = null;

export function getBillingStore(): Promise<BillingStore> {
  if (storePromise) return storePromise;

  const connectionString = process.env.DATABASE_URL;
  storePromise = connectionString
    ? createPgStore({ connectionString })
    : Promise.resolve(createMemoryStore());

  return storePromise;
}

/** Test seam: inject a mock store (and reset between tests). */
export function __setBillingStoreForTest(store: BillingStore | null): void {
  storePromise = store ? Promise.resolve(store) : null;
}
