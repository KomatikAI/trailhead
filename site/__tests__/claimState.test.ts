import { describe, it, expect } from "vitest";
import { resolveClaimState } from "@/lib/claimClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveClaimState — /welcome state machine", () => {
  it("returns missing when there is no session_id (no fetch performed)", async () => {
    let called = false;
    const state = await resolveClaimState(null, async () => {
      called = true;
      throw new Error("should not be called");
    });
    expect(state).toEqual({ status: "missing" });
    expect(called).toBe(false);
  });

  it("returns revealed on 200 with the decrypted key", async () => {
    const state = await resolveClaimState("cs_1", async () =>
      jsonResponse(200, { apiKey: "thk_abc123", once: true, message: "Store this now." }),
    );
    expect(state).toEqual({
      status: "revealed",
      apiKey: "thk_abc123",
      message: "Store this now.",
    });
  });

  it("returns already_claimed on 410 with code already_claimed", async () => {
    const state = await resolveClaimState("cs_2", async () =>
      jsonResponse(410, {
        error: "This key was already claimed.",
        code: "already_claimed",
        message: "For a new key, rotate via the billing portal or contact support.",
      }),
    );
    expect(state).toEqual({
      status: "already_claimed",
      message: "For a new key, rotate via the billing portal or contact support.",
    });
  });

  it("returns expired on 410 with code expired", async () => {
    const state = await resolveClaimState("cs_3", async () =>
      jsonResponse(410, {
        error: "This claim link has expired.",
        code: "expired",
        message: "Contact support to issue a replacement key.",
      }),
    );
    expect(state).toEqual({
      status: "expired",
      message: "Contact support to issue a replacement key.",
    });
  });

  it("returns not_found on 404", async () => {
    const state = await resolveClaimState("cs_unknown", async () =>
      jsonResponse(404, { error: "No key claim for this session." }),
    );
    expect(state).toEqual({ status: "not_found" });
  });

  it("returns rate_limited on 429", async () => {
    const state = await resolveClaimState("cs_4", async () => jsonResponse(429, {}));
    expect(state).toEqual({ status: "rate_limited" });
  });

  it("returns error on network failure", async () => {
    const state = await resolveClaimState("cs_5", async () => {
      throw new Error("network down");
    });
    expect(state.status).toBe("error");
  });

  it("returns error on an unexpected status", async () => {
    const state = await resolveClaimState("cs_6", async () =>
      jsonResponse(500, { error: "Could not decrypt key. Contact support to rotate." }),
    );
    expect(state).toEqual({
      status: "error",
      message: "Could not decrypt key. Contact support to rotate.",
    });
  });
});
