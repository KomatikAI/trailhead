import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BillingStore } from "@/lib/cloudStore";
import { encryptClaim } from "@/lib/claimCrypto";

// Mock the store accessor so the route never touches the real cloud package.
vi.mock("@/lib/cloudStore", () => ({
  getBillingStore: vi.fn(),
}));

import { getBillingStore } from "@/lib/cloudStore";
import { GET } from "@/app/api/billing/claim/route";

const SECRET = "claim-route-secret";
const KEY = "thk_oneTimeRevealKey0001";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("TRAILHEAD_CLAIM_SECRET", SECRET);
  vi.clearAllMocks();
});

function req(sessionId?: string, ip = Math.random().toString(36)): Request {
  const url = sessionId
    ? `http://localhost/api/billing/claim?session_id=${sessionId}`
    : `http://localhost/api/billing/claim`;
  return new Request(url, { headers: { "x-forwarded-for": ip } });
}

function setStore(store: Partial<BillingStore>) {
  (getBillingStore as ReturnType<typeof vi.fn>).mockResolvedValue(store as BillingStore);
}

describe("GET /api/billing/claim — one-time semantics", () => {
  it("reveals the decrypted key exactly once, then reports already_claimed", async () => {
    const ciphertext = encryptClaim(KEY, SECRET);
    let claimed = false;
    setStore({
      // Real claimKey (cloud/src/store.ts / pg-store.ts): a single atomic call
      // returning a discriminated union — {ciphertext} | {alreadyClaimed:true}
      // | {expired:true} | null. There is no separate getKeyClaimStatus (that
      // only ever existed in the stale ambient .d.ts) — the variants
      // themselves carry the status.
      claimKey: vi.fn(async () => {
        if (claimed) return { alreadyClaimed: true as const };
        claimed = true;
        return { ciphertext };
      }),
    });

    const first = await GET(req("cs_1"));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.apiKey).toBe(KEY);
    expect(body.once).toBe(true);

    const second = await GET(req("cs_1"));
    expect(second.status).toBe(410);
    expect((await second.json()).code).toBe("already_claimed");
  });

  it("404s for an unknown session", async () => {
    setStore({
      claimKey: vi.fn(async () => null),
    });
    const res = await GET(req("cs_unknown"));
    expect(res.status).toBe(404);
  });

  it("410s (expired) for an unclaimed but expired claim", async () => {
    setStore({
      claimKey: vi.fn(async () => ({ expired: true as const })),
    });
    const res = await GET(req("cs_expired"));
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("expired");
  });

  it("400s when session_id is missing", async () => {
    setStore({});
    const res = await GET(req(undefined));
    expect(res.status).toBe(400);
  });
});
