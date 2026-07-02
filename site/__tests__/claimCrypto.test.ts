import { describe, it, expect } from "vitest";
import { encryptClaim, decryptClaim } from "@/lib/claimCrypto";

const SECRET = "test-claim-secret-0123456789";

describe("claimCrypto (AES-256-GCM)", () => {
  it("round-trips a plaintext key", () => {
    const plain = "thk_deadbeefdeadbeefdeadbeefdeadbeef";
    const env = encryptClaim(plain, SECRET);
    expect(env).not.toContain(plain);
    expect(decryptClaim(env, SECRET)).toBe(plain);
  });

  it("uses a fresh random IV per encryption (ciphertext differs)", () => {
    const plain = "thk_same";
    const a = encryptClaim(plain, SECRET);
    const b = encryptClaim(plain, SECRET);
    expect(a).not.toBe(b);
    expect(decryptClaim(a, SECRET)).toBe(plain);
    expect(decryptClaim(b, SECRET)).toBe(plain);
  });

  it("is authenticated — a tampered ciphertext fails to decrypt", () => {
    const env = encryptClaim("thk_secret", SECRET);
    const parts = env.split(".");
    // flip a byte in the ciphertext segment
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 0xff;
    parts[3] = ct.toString("base64url");
    expect(() => decryptClaim(parts.join("."), SECRET)).toThrow();
  });

  it("fails with the wrong secret", () => {
    const env = encryptClaim("thk_secret", SECRET);
    expect(() => decryptClaim(env, "wrong-secret")).toThrow();
  });

  it("throws on a malformed envelope", () => {
    expect(() => decryptClaim("not-an-envelope", SECRET)).toThrow(/malformed/);
  });

  it("throws when the secret is missing", () => {
    expect(() => encryptClaim("x", undefined)).toThrow(/TRAILHEAD_CLAIM_SECRET/);
  });
});
