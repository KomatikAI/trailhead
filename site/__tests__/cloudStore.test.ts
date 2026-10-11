import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __setBillingStoreForTest, getBillingStore } from "@/lib/cloudStore";

beforeEach(() => {
  vi.unstubAllEnvs();
  __setBillingStoreForTest(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  __setBillingStoreForTest(null);
});

describe("getBillingStore", () => {
  it("refuses the in-memory fallback in a production deployment", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getBillingStore()).toThrow(/DATABASE_URL is not set in production/);
  });

  it("falls back to the in-memory store outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DATABASE_URL", "");
    const store = await getBillingStore();
    expect(typeof store.listSubscriptions).toBe("function");
  });
});
