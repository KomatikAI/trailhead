import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "trailhead-cloud/store";
import { __setBillingStoreForTest } from "@/lib/cloudStore";

const createSession = vi.fn(async (_params: Record<string, unknown>) => ({
  url: "https://billing.stripe.com/p/session",
}));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({ billingPortal: { sessions: { create: createSession } } }),
}));
import { POST } from "@/app/api/billing/portal/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3200");
  __setBillingStoreForTest(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  __setBillingStoreForTest(null);
});

function request(key?: string) {
  return new Request("http://localhost:3200/api/billing/portal", {
    method: "POST",
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      "x-forwarded-for": crypto.randomUUID(),
    },
  });
}

describe("billing portal", () => {
  it("rejects missing and unknown keys without creating a portal session", async () => {
    __setBillingStoreForTest(createMemoryStore());
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("thk_unknown"))).status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("allows a suspended customer to fix billing, using only the key's customer", async () => {
    const store = createMemoryStore();
    const { keySecret } = await store.createOrgWithSubscription({
      orgName: "Test",
      plan: "pro",
      stripeCustomerId: "cus_owned",
      stripeSubscriptionId: "sub_owned",
      status: "active",
    });
    await store.updateSubscriptionByStripeId("sub_owned", { status: "past_due" });
    __setBillingStoreForTest(store);
    const response = await POST(request(keySecret));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://billing.stripe.com/p/session",
    });
    expect(createSession).toHaveBeenCalledWith({
      customer: "cus_owned",
      return_url: "http://localhost:3200/dashboard",
    });
  });
});
