-- Accountant links: hash the token at rest, and give access an expiry.
--
-- GDPR audit 14 Aug 2026. Two defects in one feature:
--   1. AccountantAccess had no expiresAt at all, so a link issued once
--      worked forever, including after the engagement ended.
--   2. The token was stored in plaintext, so read access to the database
--      was read access to every user's tax data via a plain URL.
--
-- tokenHash is nullable in this migration and backfilled by
-- scripts/backfill-accountant-token-hashes.ts, so existing emailed links
-- keep working: the incoming raw token is hashed and matched. The
-- plaintext `token` columns are dropped in a later migration once the
-- backfill reports zero remaining rows.

ALTER TABLE `accountant_invites`
  ADD COLUMN `tokenHash` VARCHAR(64) NULL;

ALTER TABLE `accountant_access`
  ADD COLUMN `tokenHash` VARCHAR(64) NULL,
  ADD COLUMN `expiresAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `accountant_invites_tokenHash_key` ON `accountant_invites`(`tokenHash`);
CREATE UNIQUE INDEX `accountant_access_tokenHash_key` ON `accountant_access`(`tokenHash`);
CREATE INDEX `accountant_access_expiresAt_idx` ON `accountant_access`(`expiresAt`);
