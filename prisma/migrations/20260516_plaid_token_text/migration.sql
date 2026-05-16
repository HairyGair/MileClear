-- Tokens are AES-256-GCM-encrypted before storage. The base64-encoded
-- ciphertext of a TrueLayer JWT comfortably exceeds VARCHAR(500), so
-- the exchange call was hitting Prisma's P2000 ("value too long for
-- column") and the whole bank-link flow failed. TEXT is effectively
-- unbounded for our needs (65,535 bytes).
ALTER TABLE `plaid_connections`
  MODIFY `accessToken` TEXT NOT NULL,
  MODIFY `refreshToken` TEXT NULL;
