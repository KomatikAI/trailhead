import { describe, it, expect, beforeEach, vi } from "vitest";
import type Stripe from "stripe";
import { createMemoryStore } from "trailhead-cloud";
import type { BillingStore } from "@/lib/cloudStore";
import { handleStripeEvent as applyEvent } from "@/lib/webhookHandlers";
import { decryptClaim } from "@/lib/claimCrypto";

const SECRET = "webhook-test-secret";

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    items: { data: [{ price: { id: "price_pro_123" }, current_period_end: 1893456000 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function handleStripeEvent(event: Stripe.Event, store: BillingStore) {
  return applyEvent(event, store, async () =>
    event.type.startsWith("customer.subscription.")
      ? (event.data.object as Stripe.Subscription)
      : subscription(),
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("TRAILHEAD_CLAIM_SECRET", SECRET);
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_123");
  vi.stubEnv("STRIPE_PRICE_TEAM", "price_team_456");
});

/**
 * A mock BillingStore recording calls; recordStripeEvent is first-seen by
 * default. Typed against the REAL store shape (cloud/src/types.ts CloudStore)
 * — positional args, boolean firstSeen, {org,keySecret,keyRecord} result,
 * string|null updateSubscriptionByStripeId — not the fictional ambient .d.ts
 * shape this file used to mock against.
 */
function mockStore(overrides: Partial<BillingStore> = {}): BillingStore {
  const seen = new Set<string>();
  const base: Partial<BillingStore> = {
    hasStripeEvent: vi.fn(async (eventId: string) => seen.has(eventId)),
    fulfillCheckout: vi.fn(async (_input, claim) => {
      await base.createKeyClaim!(
        claim.sessionId,
        "org_1",
        claim.encryptKey("thk_generatedsecretkey"),
        claim.expiresAt,
      );
      return "org_1";
    }),
    recordStripeEvent: vi.fn(async (eventId: string) => {
      const firstSeen = !seen.has(eventId);
      seen.add(eventId);
      return firstSeen;
    }),
    removeStripeEvent: vi.fn(async (eventId: string) => {
      seen.delete(eventId);
    }),
    createOrgWithSubscription: vi.fn(async () => ({
      org: { id: "org_1", name: "acme.com", createdAt: new Date().toISOString() },
      keySecret: "thk_generatedsecretkey",
      keyRecord: {
        keyId: "key_1",
        key: "thk_generatedsecretkey",
        orgId: "org_1",
        orgName: "acme.com",
        suspended: false,
      },
    })),
    createKeyClaim: vi.fn(async () => undefined),
    updateSubscriptionByStripeId: vi.fn(async () => "org_1"),
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
        payment_status: "paid",
        metadata: { plan: "pro", email: "dev@acme.com" },
        customer: "cus_1",
        subscription: "sub_1",
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent — idempotency", () => {
  it("skips an event whose effects already completed", async () => {
    const store = mockStore();
    const evt = checkoutEvent();
    const first = await handleStripeEvent(evt, store);
    const second = await handleStripeEvent(evt, store);
    expect(first.handled).toBe(true);
    expect(second).toEqual({ handled: false, reason: "duplicate" });
    expect(store.fulfillCheckout).toHaveBeenCalledTimes(1);
  });

  it("records no completion on handler failure so Stripe's retry can reprocess", async () => {
    const store = mockStore({
      fulfillCheckout: vi
        .fn()
        .mockRejectedValueOnce(new Error("transient db error"))
        .mockResolvedValueOnce("org_1"),
    });
    const evt = checkoutEvent();

    await expect(handleStripeEvent(evt, store)).rejects.toThrow("transient db error");
    expect(store.recordStripeEvent).not.toHaveBeenCalled();

    // Stripe retries the SAME event id — it must NOT short-circuit as duplicate.
    const retry = await handleStripeEvent(evt, store);
    expect(retry.handled).toBe(true);
    expect(store.fulfillCheckout).toHaveBeenCalledTimes(2);
  });
});

describe("handleStripeEvent — checkout.session.completed", () => {
  it("creates org+subscription and writes an encrypted, decryptable key claim", async () => {
    const store = mockStore();
    const res = await handleStripeEvent(checkoutEvent(), store);

    expect(res).toEqual({ handled: true, orgId: "org_1" });
    expect(store.fulfillCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "pro",
        orgName: "acme.com", // email domain per contract
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      }),
      expect.objectContaining({ sessionId: "cs_test_1" }),
    );

    // createKeyClaim is positional: (sessionId, orgId, ciphertext, expiresAt).
    const claimArgs = (store.createKeyClaim as ReturnType<typeof vi.fn>).mock.calls[0];
    const [sessionId, orgId, ciphertext, expiresAt] = claimArgs;
    expect(sessionId).toBe("cs_test_1");
    expect(orgId).toBe("org_1");
    expect(ciphertext).not.toContain("thk_generatedsecretkey");
    // ciphertext decrypts back to the plaintext key (never stored raw)
    expect(decryptClaim(ciphertext, SECRET)).toBe("thk_generatedsecretkey");
    // ~72h expiry
    const ttl = new Date(expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(71 * 3600 * 1000);
    expect(ttl).toBeLessThan(73 * 3600 * 1000);
  });

  it("rejects a session with missing/invalid plan metadata", async () => {
    const store = mockStore();
    const evt = checkoutEvent({ metadata: { email: "x@y.com" } });
    const res = await handleStripeEvent(evt, store);
    expect(res.handled).toBe(false);
    expect(res.reason).toBe("missing_or_invalid_plan_metadata");
    expect(store.fulfillCheckout).not.toHaveBeenCalled();
  });

  it("rejects when customer or subscription id is absent", async () => {
    const store = mockStore();
    const evt = checkoutEvent({ subscription: null });
    const res = await handleStripeEvent(evt, store);
    expect(res.reason).toBe("missing_customer_or_subscription");
  });
});

describe("handleStripeEvent — subscription lifecycle", () => {
  function subEvent(
    type: string,
    status: string,
    priceId = "price_team_456",
  ): Stripe.Event {
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
    const evt = {
      id: "evt_x",
      type: "invoice.paid",
      data: { object: {} },
    } as unknown as Stripe.Event;
    const res = await handleStripeEvent(evt, store);
    expect(res).toEqual({ handled: false, reason: "ignored" });
    expect(store.recordStripeEvent).toHaveBeenCalledOnce();
  });
});

/**
 * Integration path against the REAL `createMemoryStore()` from the
 * `trailhead-cloud` package — not a hand-rolled mock. This is the test that
 * would have caught the whole P0: every mock above (and every mock this file
 * used to have) encoded the fictional ambient-.d.ts interface, so they stayed
 * green while the real store's shapes silently diverged (boolean
 * recordStripeEvent, {org,keySecret} result, positional createKeyClaim,
 * string|null updateSubscriptionByStripeId, discriminated-union claimKey).
 */
describe("handleStripeEvent — real store integration (createMemoryStore)", () => {
  it("does not restore access when a canceled subscription's Checkout arrives late", async () => {
    const store = createMemoryStore();
    const current = subscription({ status: "canceled" });
    const retrieve = vi.fn(async () => current);
    const deleted = {
      id: "evt_deleted_first",
      type: "customer.subscription.deleted",
      data: { object: current },
    } as Stripe.Event;
    await applyEvent(deleted, store, retrieve);
    const result = await applyEvent(checkoutEvent(), store, retrieve);
    const claim = await store.claimKey("cs_test_1");
    const secret = decryptClaim((claim as { ciphertext: string }).ciphertext, SECRET);
    expect((await store.getOrgForKey(secret))?.suspended).toBe(true);
    expect((await store.getSubscriptionForOrg(result.orgId!))?.status).toBe("canceled");
  });

  it("uses current Stripe status when an old active update arrives after cancellation", async () => {
    const store = createMemoryStore();
    const created = await handleStripeEvent(checkoutEvent(), store);
    const oldUpdate = {
      id: "evt_old_active",
      type: "customer.subscription.updated",
      data: { object: subscription() },
    } as Stripe.Event;
    await applyEvent(oldUpdate, store, async () => subscription({ status: "canceled" }));
    expect((await store.getSubscriptionForOrg(created.orgId!))?.status).toBe("canceled");
  });

  it("leaves a failed Stripe lookup retryable without provisioning access", async () => {
    const store = createMemoryStore();
    await expect(
      applyEvent(checkoutEvent(), store, async () => {
        throw new Error("Stripe unavailable");
      }),
    ).rejects.toThrow("Stripe unavailable");
    expect(await store.hasStripeEvent("evt_checkout_1")).toBe(false);
    expect(await store.listSubscriptions()).toHaveLength(0);
    expect((await handleStripeEvent(checkoutEvent(), store)).handled).toBe(true);
  });

  it("uses the current price and rejects mismatched subscription ownership", async () => {
    const store = mockStore();
    await expect(
      applyEvent(checkoutEvent(), store, async () =>
        subscription({ customer: "cus_other" }),
      ),
    ).rejects.toThrow("customer mismatch");
    expect(store.fulfillCheckout).not.toHaveBeenCalled();
    await applyEvent(checkoutEvent(), store, async () =>
      subscription({ items: { data: [{ price: { id: "price_team_456" } }] } }),
    );
    expect(store.fulfillCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "team" }),
      expect.anything(),
    );
  });

  it("waits for a delayed payment before granting paid access", async () => {
    const store = createMemoryStore();
    expect(
      await handleStripeEvent(checkoutEvent({ payment_status: "unpaid" }), store),
    ).toEqual({ handled: false, reason: "payment_pending" });
    expect(await store.listSubscriptions()).toHaveLength(0);
    const paid = checkoutEvent();
    paid.id = "evt_async_paid";
    paid.type = "checkout.session.async_payment_succeeded";
    expect((await handleStripeEvent(paid, store)).handled).toBe(true);
    expect(await store.listSubscriptions()).toHaveLength(1);
  });

  it("retries a ledger failure after fulfillment without issuing another key", async () => {
    const store = createMemoryStore();
    vi.spyOn(store, "recordStripeEvent").mockRejectedValueOnce(
      new Error("ledger unavailable"),
    );
    await expect(handleStripeEvent(checkoutEvent(), store)).rejects.toThrow(
      "ledger unavailable",
    );
    const retried = await handleStripeEvent(checkoutEvent(), store);
    expect(await store.listSubscriptions()).toHaveLength(1);
    expect(await store.listManagedKeys(retried.orgId as string)).toHaveLength(1);
    expect(await store.claimKey("cs_test_1")).toEqual(
      expect.objectContaining({ ciphertext: expect.any(String) }),
    );
  });

  it("checkout.session.completed → org+key+claim created, key revealed once via claimKey", async () => {
    const store = createMemoryStore();

    const evt = checkoutEvent();
    const res = await handleStripeEvent(evt, store);
    expect(res.handled).toBe(true);
    expect(res.orgId).toBeTruthy();

    const settings = await store.getOrgSettings(res.orgId as string);
    expect(settings.plan).toBe("pro");

    // Claim the key exactly once via the real atomic claimKey.
    const first = await store.claimKey("cs_test_1");
    expect(first).not.toBeNull();
    expect(first && "ciphertext" in first).toBe(true);
    const ciphertext = (first as { ciphertext: string }).ciphertext;
    expect(decryptClaim(ciphertext, SECRET)).toMatch(/^thk_/);

    // Second reveal attempt → alreadyClaimed, not the key again.
    const second = await store.claimKey("cs_test_1");
    expect(second).toEqual({ alreadyClaimed: true });
  });

  it("duplicate webhook delivery is a true no-op against the real ledger", async () => {
    const store = createMemoryStore();
    const evt = checkoutEvent();

    const first = await handleStripeEvent(evt, store);
    const second = await handleStripeEvent(evt, store);

    expect(first.handled).toBe(true);
    expect(second).toEqual({ handled: false, reason: "duplicate" });
  });

  it("customer.subscription.updated resolves and suspends the real org", async () => {
    const store = createMemoryStore();
    const created = await handleStripeEvent(checkoutEvent(), store);
    const orgId = created.orgId as string;

    const updated = await handleStripeEvent(
      {
        id: "evt_sub_updated",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            status: "past_due",
            current_period_end: 1893456000,
            items: { data: [{ price: { id: "price_pro_123" } }] },
          },
        },
      } as unknown as Stripe.Event,
      store,
    );

    expect(updated.orgId).toBe(orgId);
    const settings = await store.getOrgSettings(orgId);
    expect(settings.plan).toBe("pro");
  });
});
