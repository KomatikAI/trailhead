import { getBillingStore } from "@/lib/cloudStore";
import { decryptClaim } from "@/lib/claimCrypto";
import { guardRateLimit } from "@/lib/rateLimit";

/**
 * GET /api/billing/claim?session_id=cs_...  — one-time API key reveal.
 *
 * Contract flow 3: if the claim is unclaimed AND unexpired, atomically mark it
 * claimed and return the key ONCE. Otherwise 410 with guidance to use key
 * rotation via support. The atomicity lives in store.claimKey (single UPDATE …
 * WHERE claimed_at IS NULL … RETURNING) so two concurrent reveals can't both win.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = guardRateLimit(req, "billing-claim", 20);
  if (denied) return denied;

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }

  const store = await getBillingStore();

  const claim = await store.claimKey(sessionId);
  if (claim) {
    let apiKey: string;
    try {
      apiKey = decryptClaim(claim.keyCiphertext);
    } catch (err) {
      // sessionId is user input — keep it out of the format-string position.
      console.error("[claim] Decrypt failed for session:", sessionId, err);
      return Response.json(
        { error: "Could not decrypt key. Contact support to rotate." },
        { status: 500 },
      );
    }
    return Response.json({
      apiKey,
      once: true,
      message: "Store this key now — it is shown only once. Add it as TRAILHEAD_API_KEY.",
    });
  }

  // Nothing revealed — explain why (unknown / already-claimed / expired).
  const status = await store.getKeyClaimStatus(sessionId);
  if (!status.exists) {
    return Response.json({ error: "No key claim for this session." }, { status: 404 });
  }
  if (status.claimed) {
    return Response.json(
      {
        error: "This key was already claimed.",
        code: "already_claimed",
        message: "For a new key, rotate via the billing portal or contact support.",
      },
      { status: 410 },
    );
  }
  return Response.json(
    {
      error: "This claim link has expired.",
      code: "expired",
      message: "Contact support to issue a replacement key.",
    },
    { status: 410 },
  );
}
