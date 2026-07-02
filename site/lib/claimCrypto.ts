import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM authenticated encryption for the one-time post-checkout API key
 * handoff (key_claims.key_ciphertext). Plaintext keys are NEVER stored — only
 * this ciphertext, decryptable solely with TRAILHEAD_CLAIM_SECRET.
 *
 * Envelope format (compact, self-describing): base64url(iv).base64url(tag).base64url(ct)
 *   - iv:  12 random bytes (GCM standard nonce; fresh per encryption)
 *   - tag: 16-byte GCM auth tag (authenticated — tamper ⇒ decrypt throws)
 *   - ct:  ciphertext
 */
const IV_BYTES = 12;
const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  // 32-byte key from the operator secret. sha256 gives a stable 256-bit key
  // regardless of the secret's length/format.
  return createHash("sha256").update(secret, "utf8").digest();
}

function b64u(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64u(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export function encryptClaim(plaintext: string, secret = process.env.TRAILHEAD_CLAIM_SECRET): string {
  if (!secret) throw new Error("TRAILHEAD_CLAIM_SECRET is not configured");
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${b64u(iv)}.${b64u(tag)}.${b64u(ct)}`;
}

export function decryptClaim(envelope: string, secret = process.env.TRAILHEAD_CLAIM_SECRET): string {
  if (!secret) throw new Error("TRAILHEAD_CLAIM_SECRET is not configured");
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("malformed claim envelope");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, fromB64u(ivB64));
  decipher.setAuthTag(fromB64u(tagB64));
  return Buffer.concat([decipher.update(fromB64u(ctB64)), decipher.final()]).toString("utf8");
}
