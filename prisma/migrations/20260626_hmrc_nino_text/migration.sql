-- Widen hmrc_connections.nino from VARCHAR(13) to TEXT.
--
-- The NINO is stored ENCRYPTED at rest (~61 chars), but the column was sized
-- for a plaintext NINO (VARCHAR(13)), so every POST /hmrc/nino failed with
-- "The provided value for the column is too long for the column's type" (HTTP
-- 500) - blocking MTD setup for all users. Found via the HMRC sandbox dry-run
-- on 26 Jun 2026. Already applied to production by hand the same day; this
-- migration records it so it reaches any fresh environment.
ALTER TABLE `hmrc_connections` MODIFY `nino` TEXT NULL;
