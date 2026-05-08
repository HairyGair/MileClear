import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encrypt,
  decrypt,
  decryptIfEncrypted,
  isEncrypted,
  resetEncryptionKey,
} from "../../lib/encryption.js";

const originalEnv = { ...process.env };

function setKey(): void {
  process.env.MTD_TOKEN_KEY = randomBytes(32).toString("base64");
  resetEncryptionKey();
}

beforeEach(() => {
  setKey();
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetEncryptionKey();
});

describe("encrypt + decrypt round trip", () => {
  it("round-trips a typical HMRC access token", () => {
    const plaintext = "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";
    const enc = encrypt(plaintext);
    expect(enc).toMatch(/^enc:v1:/);
    expect(enc).not.toContain(plaintext);
    expect(decrypt(enc)).toBe(plaintext);
  });

  it("round-trips a UK NINO", () => {
    const nino = "AB123456C";
    expect(decrypt(encrypt(nino))).toBe(nino);
  });

  it("round-trips unicode + emoji safely", () => {
    const value = "Anthony Gair — héllo 🚗 1.1.4";
    expect(decrypt(encrypt(value))).toBe(value);
  });

  it("returns empty string unchanged for empty input", () => {
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });
});

describe("decrypt rejects tampered or malformed inputs", () => {
  it("throws on missing prefix", () => {
    expect(() => decrypt("not-encrypted-value")).toThrow(/prefix/i);
  });

  it("throws on tampered ciphertext (auth tag mismatch)", () => {
    const enc = encrypt("legitimate value");
    // Flip a bit in the ciphertext segment.
    const parts = enc.split(":");
    const ctBuf = Buffer.from(parts[4], "base64");
    ctBuf[0] = ctBuf[0] ^ 0x01;
    parts[4] = ctBuf.toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const enc = encrypt("legitimate value");
    const parts = enc.split(":");
    const tagBuf = Buffer.from(parts[3], "base64");
    tagBuf[0] = tagBuf[0] ^ 0x01;
    parts[3] = tagBuf.toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on malformed wire format (wrong number of segments)", () => {
    expect(() => decrypt("enc:v1:only:two")).toThrow(/malformed/i);
  });

  it("throws when MTD_TOKEN_KEY is missing", () => {
    delete process.env.MTD_TOKEN_KEY;
    resetEncryptionKey();
    expect(() => encrypt("anything")).toThrow(/MTD_TOKEN_KEY/);
  });

  it("throws when MTD_TOKEN_KEY is wrong length", () => {
    process.env.MTD_TOKEN_KEY = Buffer.from("too-short").toString("base64");
    resetEncryptionKey();
    expect(() => encrypt("anything")).toThrow(/32 bytes/);
  });
});

describe("decryptIfEncrypted (migration-friendly read path)", () => {
  it("decrypts a properly-encrypted value", () => {
    const enc = encrypt("hmrc-access-token-xyz");
    expect(decryptIfEncrypted(enc)).toBe("hmrc-access-token-xyz");
  });

  it("returns legacy plaintext as-is (no prefix)", () => {
    expect(decryptIfEncrypted("legacy-plaintext-token")).toBe("legacy-plaintext-token");
  });

  it("returns null for null", () => {
    expect(decryptIfEncrypted(null)).toBeNull();
  });

  it("returns empty string for empty string", () => {
    expect(decryptIfEncrypted("")).toBe("");
  });
});

describe("isEncrypted", () => {
  it("returns true for encrypted values", () => {
    expect(isEncrypted(encrypt("anything"))).toBe(true);
  });

  it("returns false for plaintext", () => {
    expect(isEncrypted("plain")).toBe(false);
  });

  it("returns false for null + empty", () => {
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });
});
