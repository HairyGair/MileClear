// Application-layer encryption for sensitive fields stored in MySQL.
//
// HMRC accreditation requirement (per the production-credentials form):
// "You must encrypt access tokens and personally identifiable data
//  when it is stored and in transit."
//
// We already have TLS in transit. This module covers encryption at rest
// for the most sensitive columns:
//
//   HmrcConnection.accessToken   — HMRC OAuth bearer token
//   HmrcConnection.refreshToken  — HMRC OAuth refresh token
//   HmrcConnection.nino          — UK National Insurance Number (sensitive PII)
//   RefreshToken.token           — Our own JWT refresh tokens
//
// Algorithm: AES-256-GCM via Node's built-in `crypto`. AEAD construction
// (authenticated encryption) gives us confidentiality AND integrity in
// one primitive. No third-party dependency.
//
// Master key: 32 bytes of cryptographic random, stored in MTD_TOKEN_KEY
// env var as base64. Generate with `openssl rand -base64 32`.
//
// Wire format of an encrypted column:
//   enc:v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
//
// The `enc:v1:` prefix is deliberate. Existing plaintext rows can be
// detected by the absence of this prefix and migrated lazily — see
// `decryptIfEncrypted()` for the migration-friendly read path.
//
// To rotate the master key (e.g. on suspected compromise): bump the
// version prefix to v2, run a re-encrypt-all script that decrypts with
// v1 + re-encrypts with v2 under the new key, then remove v1 support
// after a grace period. See SECURITY_INCIDENT_RUNBOOK.md step 5.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;          // 96-bit nonce, GCM standard
const AUTH_TAG_LENGTH = 16;    // 128-bit tag
const CURRENT_VERSION = "v1";
const PREFIX = `enc:${CURRENT_VERSION}:`;

let cachedKey: Buffer | null = null;

/**
 * Load the master key from MTD_TOKEN_KEY (base64-encoded, 32 bytes raw).
 * Throws if the env var is missing or wrong length — fail loudly so we
 * never silently store plaintext when encryption was expected.
 */
function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MTD_TOKEN_KEY;
  if (!raw || !raw.trim()) {
    throw new Error(
      "MTD_TOKEN_KEY env var is missing. Generate with `openssl rand -base64 32` and set on the production server before any HMRC-token write happens."
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(
      `MTD_TOKEN_KEY must decode to 32 bytes (got ${key.length}). Regenerate with \`openssl rand -base64 32\`.`
    );
  }
  cachedKey = key;
  return key;
}

/** Test-only — never call in production. */
export function resetEncryptionKey(): void {
  cachedKey = null;
}

/**
 * Encrypt a plaintext string. Returns the wire-format encrypted blob
 * `enc:v1:<iv>:<tag>:<ct>`. Empty string round-trips as empty (we treat
 * `""` as a sentinel for "no value" and don't bother to encrypt it).
 */
export function encrypt(plaintext: string): string {
  if (plaintext === "") return "";
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypt a wire-format encrypted blob. Throws on:
 *  - missing version prefix (caller should use decryptIfEncrypted instead)
 *  - unsupported version prefix (key rotation in progress, abort)
 *  - corrupt or tampered ciphertext (auth tag mismatch)
 *
 * The auth-tag check is what makes this safe — even if an attacker
 * somehow modifies the database, decrypt fails loudly rather than
 * silently returning garbage.
 */
export function decrypt(encrypted: string): string {
  if (encrypted === "") return "";
  if (!encrypted.startsWith(PREFIX)) {
    throw new Error(
      `decrypt() called on value without ${PREFIX} prefix; use decryptIfEncrypted() during migration.`
    );
  }
  const body = encrypted.slice(PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) {
    throw new Error("Encrypted value malformed — expected iv:tag:ct");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_LENGTH) throw new Error("IV length wrong");
  if (authTag.length !== AUTH_TAG_LENGTH) throw new Error("Auth tag length wrong");

  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Migration-friendly read: decrypt if the value is encrypted, otherwise
 * return as-is (assume legacy plaintext). Use this on the read path
 * during the migration window. After every row has been migrated and
 * the migration script confirms zero plaintext rows remain, swap to
 * `decrypt()` directly so plaintext can never be silently accepted.
 */
export function decryptIfEncrypted(value: string | null): string | null {
  if (value == null) return null;
  if (value === "") return "";
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext row. Caller should re-encrypt on next write.
    return value;
  }
  return decrypt(value);
}

/** True if this value is in our encrypted wire format. */
export function isEncrypted(value: string | null): boolean {
  return value != null && value.startsWith(PREFIX);
}
