export type PlanTier = "free" | "pro" | "team";

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  evaluationsPerMonth: number;
  cloudStore: boolean;
  dashboard: boolean;
  orgRollup: boolean;
  apiKeys: boolean;
  sso: boolean;
  seatsIncluded: number;
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    evaluationsPerMonth: 0,
    cloudStore: false,
    dashboard: false,
    orgRollup: false,
    apiKeys: false,
    sso: false,
    seatsIncluded: 1,
  },
  pro: {
    id: "pro",
    name: "Pro",
    evaluationsPerMonth: 5_000,
    cloudStore: true,
    dashboard: true,
    orgRollup: false,
    apiKeys: true,
    sso: false,
    seatsIncluded: 3,
  },
  team: {
    id: "team",
    name: "Team",
    evaluationsPerMonth: 50_000,
    cloudStore: true,
    dashboard: true,
    orgRollup: true,
    apiKeys: true,
    sso: true,
    seatsIncluded: 10,
  },
};

export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function quotaHeaders(plan: PlanTier, used: number): Record<string, string> {
  const limit = PLANS[plan].evaluationsPerMonth;
  const remaining = Math.max(0, limit - used);
  return {
    "X-Trailhead-Plan": plan,
    "X-Trailhead-Quota-Limit": String(limit),
    "X-Trailhead-Quota-Used": String(used),
    "X-Trailhead-Quota-Remaining": String(remaining),
  };
}

export function canIngestEvaluation(plan: PlanTier, used: number): boolean {
  if (!PLANS[plan].cloudStore) return false;
  return used < PLANS[plan].evaluationsPerMonth;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "thk_****";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `thk_${hex}`;
}
