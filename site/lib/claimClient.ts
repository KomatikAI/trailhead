/**
 * Pure state-resolution logic for the /welcome claim page, split out of
 * ClaimClient.tsx so it's testable with a mocked `fetch` in Node (matching
 * the pattern in site/__tests__/claim.test.ts, which tests the route the
 * same way) without needing a DOM/React renderer.
 *
 * Mirrors the contract of GET /api/billing/claim
 * (site/app/api/billing/claim/route.ts):
 *   200 { apiKey, once, message }                           → revealed
 *   400 (no session_id — never reached here; guarded first)  → missing
 *   404 { error }                                            → not_found
 *   410 { error, code: "already_claimed", message }          → already_claimed
 *   410 { error, code: "expired", message }                  → expired
 *   429                                                       → rate_limited
 *   network / other                                           → error
 */
export type ClaimState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "revealed"; apiKey: string; message: string }
  | { status: "already_claimed"; message: string }
  | { status: "expired"; message: string }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export type FetchLike = (input: string) => Promise<Response>;

export async function resolveClaimState(
  sessionId: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<ClaimState> {
  if (!sessionId) {
    return { status: "missing" };
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `/api/billing/claim?session_id=${encodeURIComponent(sessionId)}`,
    );
  } catch {
    return {
      status: "error",
      message: "Network error — check your connection and reload.",
    };
  }

  if (res.status === 200) {
    const body = (await res.json()) as { apiKey: string; message: string };
    return { status: "revealed", apiKey: body.apiKey, message: body.message };
  }
  if (res.status === 429) {
    return { status: "rate_limited" };
  }
  if (res.status === 404) {
    return { status: "not_found" };
  }
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    if (body.code === "already_claimed") {
      return {
        status: "already_claimed",
        message: body.message ?? "This key was already claimed.",
      };
    }
    return { status: "expired", message: body.message ?? "This claim link has expired." };
  }

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { status: "error", message: body.error ?? "Could not load your key." };
}
