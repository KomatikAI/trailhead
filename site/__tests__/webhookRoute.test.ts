import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { createMemoryStore } from "trailhead-cloud";

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/cloudStore", () => ({ getBillingStore: vi.fn() }));
import { getStripeClient } from "@/lib/stripe";
import { getBillingStore } from "@/lib/cloudStore";
import { POST } from "@/app/api/billing/webhook/route";

const secret = "whsec_route_test_only";
const stripe = new Stripe("sk_test_route_test_only");
const payload = JSON.stringify({
  id: "evt_signed",
  type: "invoice.paid",
  data: { object: {} },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.mocked(getStripeClient).mockReturnValue(stripe);
  vi.mocked(getBillingStore).mockResolvedValue(createMemoryStore());
});

function request(signature?: string, body = payload) {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    body,
    headers: signature ? { "stripe-signature": signature } : {},
  });
}

describe("Stripe webhook authentication", () => {
  it("rejects missing signatures before accessing billing data", async () => {
    expect((await POST(request())).status).toBe(400);
    expect(getBillingStore).not.toHaveBeenCalled();
  });

  it("rejects a modified raw payload using the real Stripe verifier", async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(
      (await POST(request(signature, payload.replace("evt_signed", "evt_tampered"))))
        .status,
    ).toBe(400);
    expect(getBillingStore).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed event and records completion", async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await POST(request(signature))).status).toBe(200);
    expect(await (await getBillingStore()).hasStripeEvent("evt_signed")).toBe(true);
  });
});
