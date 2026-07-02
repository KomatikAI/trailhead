import { describe, it, expect } from "vitest";
import { submitCheckout } from "@/lib/checkoutClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("submitCheckout — pricing page checkout form handler", () => {
  it("returns a redirect result on 200 with a Stripe url", async () => {
    const result = await submitCheckout("pro", "dev@acme.com", async (url, init) => {
      expect(url).toBe("/api/billing/checkout");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ plan: "pro", email: "dev@acme.com" });
      return jsonResponse(200, { url: "https://checkout.stripe/cs_new", id: "cs_new" });
    });
    expect(result).toEqual({ status: "redirect", url: "https://checkout.stripe/cs_new" });
  });

  it("returns rate_limited with retryAfterSeconds on 429", async () => {
    const result = await submitCheckout("team", "a@b.com", async () =>
      jsonResponse(429, {
        error: "Too many requests. Please try again later.",
        code: "rate_limited",
        retryAfterSeconds: 42,
      }),
    );
    expect(result).toEqual({ status: "rate_limited", retryAfterSeconds: 42 });
  });

  it("returns rate_limited with null retryAfterSeconds when the body omits it", async () => {
    const result = await submitCheckout("pro", "a@b.com", async () => jsonResponse(429, {}));
    expect(result).toEqual({ status: "rate_limited", retryAfterSeconds: null });
  });

  it("returns error with the server message on a validation failure", async () => {
    const result = await submitCheckout("pro", "not-an-email", async () =>
      jsonResponse(400, { error: "a valid email is required" }),
    );
    expect(result).toEqual({ status: "error", message: "a valid email is required" });
  });

  it("returns error when Stripe is unavailable (503)", async () => {
    const result = await submitCheckout("team", "a@b.com", async () =>
      jsonResponse(503, { error: "Payment system unavailable" }),
    );
    expect(result).toEqual({ status: "error", message: "Payment system unavailable" });
  });

  it("returns error when the response has no url", async () => {
    const result = await submitCheckout("pro", "a@b.com", async () => jsonResponse(200, {}));
    expect(result).toEqual({
      status: "error",
      message: "Checkout session did not return a redirect URL.",
    });
  });

  it("returns error on a network failure", async () => {
    const result = await submitCheckout("pro", "a@b.com", async () => {
      throw new Error("network down");
    });
    expect(result).toEqual({
      status: "error",
      message: "Network error — check your connection and try again.",
    });
  });
});
