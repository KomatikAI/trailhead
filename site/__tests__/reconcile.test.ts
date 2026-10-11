import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type Stripe from "stripe";
import { createMemoryStore } from "trailhead-cloud";
import { __setBillingStoreForTest, type BillingStore } from "@/lib/cloudStore";

const stripeSubs: Stripe.Subscription[] = [];

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    subscriptions: {
      list: () =>
        (async function* () {
          yield* stripeSubs;
        })(),
    },
  }),
}));

const { GET } = await import("@/app/api/billing/reconcile/route");

const CRON_SECRET = "reconcile-test-secret";

function stripeSub(id: string, priceId: string, status = "active"): Stripe.Subscription {
  return {
    id,
    status,
    customer: "cus_1",
    current_period_end: 1_900_000_000,
    items: { data: [{ price: { id: priceId } }] },
  } as unknown as Stripe.Subscription;
}

function cronRequest(token = CRON_SECRET): Request {
  return new Request("https://trailhead.test/api/billing/reconcile", {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function seedProOrg(store: BillingStore): Promise<string> {
  const { org } = await store.createOrgWithSubscription({
    orgName: "acme.com",
    plan: "pro",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    status: "active",
    currentPeriodEnd: new Date(1_900_000_000 * 1000).toISOString(),
  });
  return org.id;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_123");
  vi.stubEnv("STRIPE_PRICE_TEAM", "price_team_456");
  stripeSubs.length = 0;
});

afterEach(() => {
  __setBillingStoreForTest(null);
});

describe("GET /api/billing/reconcile", () => {
  it("rejects a wrong cron secret", async () => {
    __setBillingStoreForTest(createMemoryStore());
    const res = await GET(cronRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("re-syncs an org plan that disagrees with its active Stripe subscription", async () => {
    const store = createMemoryStore();
    __setBillingStoreForTest(store);
    const orgId = await seedProOrg(store);
    // Simulate a plan written outside billing (the pre-fix self-upgrade path).
    await store.updateOrgSettings(orgId, { plan: "team" });
    stripeSubs.push(stripeSub("sub_1", "price_pro_123"));

    const res = await GET(cronRequest());
    const body = (await res.json()) as { planRepaired: number; resynced: number };

    expect(res.status).toBe(200);
    expect(body.planRepaired).toBe(1);
    expect(body.resynced).toBe(0);
    expect((await store.getOrgSettings(orgId)).plan).toBe("pro");
  });

  it("leaves a consistent org alone", async () => {
    const store = createMemoryStore();
    __setBillingStoreForTest(store);
    const orgId = await seedProOrg(store);
    stripeSubs.push(stripeSub("sub_1", "price_pro_123"));

    const res = await GET(cronRequest());
    const body = (await res.json()) as { planRepaired: number };

    expect(body.planRepaired).toBe(0);
    expect((await store.getOrgSettings(orgId)).plan).toBe("pro");
  });

  it("does not repair plans from canceled subscriptions", async () => {
    const store = createMemoryStore();
    __setBillingStoreForTest(store);
    const orgId = await seedProOrg(store);
    await store.updateSubscriptionByStripeId("sub_1", { status: "canceled" });
    await store.updateOrgSettings(orgId, { plan: "free" });
    stripeSubs.push(stripeSub("sub_1", "price_pro_123", "canceled"));

    const res = await GET(cronRequest());
    const body = (await res.json()) as { planRepaired: number };

    expect(body.planRepaired).toBe(0);
    expect((await store.getOrgSettings(orgId)).plan).toBe("free");
  });
});
