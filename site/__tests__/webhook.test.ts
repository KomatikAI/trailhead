import { describe, it, expect, beforeEach, vi } from "vitest";
import type Stripe from "stripe";
import type { BillingStore } from "trailhead-cloud";
import { handleStripeEvent } from "@/lib/webhookHandlers";
import { decryptClaim } from "@/lib/claimCrypto";

const SECRET = "webhook-test-secret";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("TRAILHEAD_CLAIM_SECRET", SECRET);
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_123");
  vi.stubEnv("STRIPE_PRICE_TEAM", "price_team_456");
});

/** A mock BillingStore recording calls; recordStripeEvent is first-seen by default. */
function mockStore(overrides: Partial<BillingStore> = {}): BillingStore {
  const seen = new Set<string>();
  const base: Partial<BillingStore> = {
    recordStripeEvent: vi.fn(async ({ eventId }) => {
      const firstSeen = !seen.has(eventId);
      seen.add(eventId);
      return { firstSeen };
    }),
    removeStripeEvent: vi.fn(async (eventId: string) => {
      seen.delete(eventId);
    }),
    createOrgWithSubscription: vi.fn(async () => ({
      orgId: "org_1",
      apiKeySecret: "thk_generatedsecretkey",
      keyPreview: "thk_gen…rkey",
    })),
    createKeyClaim: vi.fn(async () => undefined),
    updateSubscriptionByStripeId: vi.fn(async () => ({ orgId: "org_1" })),
  };
  return { ...base, ...overrides } as BillingStore;
}

function checkoutEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        metadata: { plan: "pro", email: "dev@acme.com" },
        customer: "cus_1",
        subscription: "sub_1",
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent — idempotency", () => {
  it("skips a duplicate event id (insert-first ledger)", async () => {
    const store = mockStore();
    const evt = checkoutEvent();
    const first = await handleStripeEvent(evt, store);
    const second = await handleStripeEvent(evt, store);
    expect(first.handled).toBe(true);
    expect(second).toEqual({ handled: false, reason: "duplicate" });
    expect(store.createOrgWithSubscription).toHaveBeenCalledTimes(1);
  });

  it("rolls the ledger back on handler failure so Stripe's retry can reprocess", async () => {
    const store = mockStore({
      createOrgWithSubscription: vi
        .fn()
        .mockRejectedValueOnce(new Error("transient db error"))
        .mockResolvedValueOnce({
          orgId: "org_1",
          apiKeySecret: "thk_generatedsecretkey",
          keyPreview: "thk_gen…rkey",
        }),
    });
    const evt = checkoutEvent();

    await expect(handleStripeEvent(evt, store)).rejects.toThrow("transient db error");
    expect(store.removeStripeEvent).toHaveBeenCalledWith(evt.id);

    // Stripe retries the SAME event id — it must NOT short-circuit as duplicate.
    const retry = await handleStripeEvent(evt, store);
    expect(retry.handled).toBe(true);
    expect(store.createOrgWithSubscription).toHaveBeenCalledTimes(2);
  });
});

describe("handleStripeEvent — checkout.session.completed", () => {
  it("creates org+subscription and writes an encrypted, decryptable key claim", async () => {
    const store = mockStore();
    const res = await handleStripeEvent(checkoutEvent(), store);

    expect(res).toEqual({ handled: true, orgId: "org_1" });
    expect(store.createOrgWithSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "pro",
        orgName: "acme.com", // email domain per contract
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      }),
    );

    const claimArg = (store.createKeyClaim as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(claimArg.checkoutSessionId).toBe("cs_test_1");
    expect(claimArg.keyCiphertext).not.toContain("thk_generatedsecretkey");
    // ciphertext decrypts back to the plaintext key (never stored raw)
    expect(decryptClaim(claimArg.keyCiphertext, SECRET)).toBe("thk_generatedsecretkey");
    // ~72h expiry
    const ttl = new Date(claimArg.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(71 * 3600 * 1000);
    expect(ttl).toBeLessThan(73 * 3600 * 1000);
  });

  it("rejects a session with missing/invalid plan metadata", async () => {
    const store = mockStore();
    const evt = checkoutEvent({ metadata: { email: "x@y.com" } });
    const res = await handleStripeEvent(evt, store);
    expect(res.handled).toBe(false);
    expect(res.reason).toBe("missing_or_invalid_plan_metadata");
    expect(store.createOrgWithSubscription).not.toHaveBeenCalled();
  });

  it("rejects when customer or subscription id is absent", async () => {
    const store = mockStore();
    const evt = checkoutEvent({ subscription: null });
    const res = await handleStripeEvent(evt, store);
    expect(res.reason).toBe("missing_customer_or_subscription");
  });
});

describe("handleStripeEvent — subscription lifecycle", () => {
  function subEvent(type: string, status: string, priceId = "price_team_456"): Stripe.Event {
    return {
      id: `evt_${type}_${status}`,
      type,
      data: {
        object: {
          id: "sub_1",
          status,
          current_period_end: 1893456000, // 2030-01-01
          items: { data: [{ price: { id: priceId } }] },
        },
      },
    } as unknown as Stripe.Event;
  }

  it("syncs plan/status/period on customer.subscription.updated", async () => {
    const store = mockStore();
    await handleStripeEvent(subEvent("customer.subscription.updated", "past_due"), store);
    expect(store.updateSubscriptionByStripeId).toHaveBeenCalledWith("sub_1", {
      plan: "team",
      status: "past_due",
      currentPeriodEnd: new Date(1893456000 * 1000).toISOString(),
    });
  });

  it("marks canceled on customer.subscription.deleted", async () => {
    const store = mockStore();
    await handleStripeEvent(subEvent("customer.subscription.deleted", "canceled"), store);
    expect(store.updateSubscriptionByStripeId).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ status: "canceled" }),
    );
  });

  it("ignores unrelated event types (but still ledgers them)", async () => {
    const store = mockStore();
    const evt = { id: "evt_x", type: "invoice.paid", data: { object: {} } } as unknown as Stripe.Event;
    const res = await handleStripeEvent(evt, store);
    expect(res).toEqual({ handled: false, reason: "ignored" });
    expect(store.recordStripeEvent).toHaveBeenCalledOnce();
  });
});
