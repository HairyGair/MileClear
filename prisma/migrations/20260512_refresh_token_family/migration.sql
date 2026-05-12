-- Refresh-token family + replay detection (Laura Joyce bug, 12 May 2026).
-- The previous rotating-token implementation deleted the old token on
-- every refresh, which produced false 401s when the network dropped
-- the rotation response mid-flight (iOS process suspension being the
-- common case). Result: legitimate users got auto-logged-out, and on
-- re-login via Apple sometimes ended up in a brand-new blank profile.
--
-- New design: keep old tokens linked to their successors, allow a
-- grace-path recovery if the immediate successor is still the chain
-- head, and revoke the entire family on detected replay.
ALTER TABLE `refresh_tokens`
    ADD COLUMN `familyId` VARCHAR(191) NULL,
    ADD COLUMN `rotatedToTokenId` VARCHAR(191) NULL,
    ADD COLUMN `revokedAt` DATETIME(3) NULL;

-- Backfill familyId: every existing token becomes its own one-row
-- family (using the row's id as the family). This preserves current
-- behaviour for tokens issued before the new flow goes live.
UPDATE `refresh_tokens` SET `familyId` = `id` WHERE `familyId` IS NULL;

-- Make familyId NOT NULL now that the backfill is done.
ALTER TABLE `refresh_tokens` MODIFY COLUMN `familyId` VARCHAR(191) NOT NULL;

-- Index on familyId so the "revoke all family members" path is a
-- single B-tree lookup, not a full-table scan.
CREATE INDEX `refresh_tokens_familyId_idx` ON `refresh_tokens`(`familyId`);
