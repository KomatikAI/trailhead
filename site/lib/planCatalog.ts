/**
 * Marketing-facing plan catalog for the pricing page.
 *
 * Mirrors `cloud/src/billing.ts` PLANS exactly. The real `trailhead-cloud`
 * package now exports `PLANS` directly (see cloud/src/index.ts) — this file
 * could be replaced with `import { PLANS } from "trailhead-cloud"`, but is
 * left as a separate catalog since the pricing page wants marketing copy
 * fields (name, orgRollup, sso) that PLANS doesn't carry.
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
