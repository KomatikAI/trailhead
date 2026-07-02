/**
 * Marketing-facing plan catalog for the pricing page.
 *
 * Mirrors `cloud/src/billing.ts` PLANS exactly (Lane A, `feat/cloud-pg-store`,
 * not yet merged into this branch). We don't import PLANS from the
 * `trailhead-cloud` package here because the ambient module declaration in
 * `site/types/trailhead-cloud.d.ts` (Lane B's pre-merge compatibility shim)
 * doesn't export it yet — importing it would pass at runtime post-merge but
 * fail `tsc` today. Once Lane A merges and the package exposes real types,
 * swap this for `import { PLANS } from "trailhead-cloud"` and delete this file.
 */
export interface PlanCatalogEntry {
  id: "free" | "pro" | "team";
  name: string;
  evaluationsPerMonth: number;
  orgRollup: boolean;
  sso: boolean;
  seatsIncluded: number;
}

export const PLAN_CATALOG: Record<"free" | "pro" | "team", PlanCatalogEntry> = {
  free: {
    id: "free",
    name: "Free",
    evaluationsPerMonth: 0,
    orgRollup: false,
    sso: false,
    seatsIncluded: 1,
  },
  pro: {
    id: "pro",
    name: "Pro",
    evaluationsPerMonth: 5_000,
    orgRollup: false,
    sso: false,
    seatsIncluded: 3,
  },
  team: {
    id: "team",
    name: "Team",
    evaluationsPerMonth: 50_000,
    orgRollup: true,
    sso: true,
    seatsIncluded: 10,
  },
};
