import type { PaidPlan } from "@/lib/plans";

/**
 * Pure submit logic for the pricing page's checkout form, split out of
 * CheckoutForm.tsx so it's testable with a mocked `fetch` in Node (matching
 * site/__tests__/checkout.test.ts, which tests the route the same way)
 * without needing a DOM/React renderer.
 *
 * Mirrors POST /api/billing/checkout (site/app/api/billing/checkout/route.ts):
 *   200 { url, id }                                → redirect
 *   400/500/503 { error }                          → error
 *   429 { error, code, retryAfterSeconds } + header → rate_limited
 *   network / other                                 → error
 */
export type CheckoutResult =
  | { status: "redirect"; url: string }
  | { status: "rate_limited"; retryAfterSeconds: number | null }
  | { status: "error"; message: string };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function submitCheckout(
  plan: PaidPlan,
  email: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckoutResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, email }),
    });
  } catch {
    return { status: "error", message: "Network error — check your connection and try again." };
  }

  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { retryAfterSeconds?: number };
    return {
      status: "rate_limited",
      retryAfterSeconds: typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : null,
    };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: "error", message: body.error ?? "Something went wrong. Try again." };
  }

  const body = (await res.json()) as { url?: string };
  if (!body.url) {
    return { status: "error", message: "Checkout session did not return a redirect URL." };
  }
  return { status: "redirect", url: body.url };
}
