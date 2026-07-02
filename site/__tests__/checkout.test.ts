import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Stripe client factory so no real Stripe SDK / key is needed.
const createSession = vi.fn(async (_params: Record<string, unknown>) => ({
  id: "cs_new",
  url: "https://checkout.stripe/cs_new",
}));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(() => ({ checkout: { sessions: { create: createSession } } })),
}));

import { POST } from "@/app/api/billing/checkout/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_123");
  vi.stubEnv("STRIPE_PRICE_TEAM", "price_team_456");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://trailhead.komatik.xyz");
});

function post(body: unknown, ip = Math.random().toString(36)): Request {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/checkout — validation", () => {
  it("rejects an invalid plan", async () => {
    const res = await POST(post({ plan: "enterprise", email: "a@b.com" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/plan/);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const res = await POST(post({ plan: "pro", email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/);
  });

  it("rejects invalid JSON", async () => {
    const bad = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "j" },
      body: "{not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("500s when the plan has no configured price", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "");
    const res = await POST(post({ plan: "pro", email: "a@b.com" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/billing/checkout — happy path", () => {
  it("creates a subscription Checkout Session with plan metadata + contract urls", async () => {
    const res = await POST(post({ plan: "team", email: "dev@acme.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe/cs_new",
      id: "cs_new",
    });

    const [firstCall] = createSession.mock.calls;
    if (!firstCall) throw new Error("createSession was not called");
    const arg = firstCall[0];
    expect(arg.mode).toBe("subscription");
    expect(arg.customer_email).toBe("dev@acme.com");
    expect(arg.line_items).toEqual([{ price: "price_team_456", quantity: 1 }]);
    expect(arg.metadata).toEqual({ plan: "team", email: "dev@acme.com" });
    expect(arg.subscription_data).toEqual({
      metadata: { plan: "team", email: "dev@acme.com" },
    });
    expect(arg.success_url).toBe(
      "https://trailhead.komatik.xyz/welcome?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(arg.cancel_url).toBe("https://trailhead.komatik.xyz/pricing");
  });
});

describe("POST /api/billing/checkout — rate limiting", () => {
  it("429s after the per-IP limit is exceeded", async () => {
    const ip = "203.0.113.9";
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await POST(post({ plan: "pro", email: "a@b.com" }, ip));
    }
    if (!last) throw new Error("no response captured");
    expect(last.status).toBe(429);
    expect(last.headers.get("Retry-After")).toBeTruthy();
  });
});
