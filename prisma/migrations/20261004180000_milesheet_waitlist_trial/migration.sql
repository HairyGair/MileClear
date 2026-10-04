-- Milesheet waiting list + free trial (4 Oct 2026).
--
-- team_interest: a request to start a team that was parked on the waiting
-- list (MILESHEET_NEW_TEAMS = "waitlist") is stored here, so nothing is lost.
-- drivers / approval / destination become nullable because a driver naming
-- their manager in the app does not answer those questions. Existing rows
-- keep their values; every new column is nullable, no backfill.
--
-- organisations.trialEndsAt: the free trial for teams started once new
-- teams reopen. Null for every existing team.

-- AlterTable
ALTER TABLE `team_interest`
    MODIFY `drivers` VARCHAR(8) NULL,
    MODIFY `approval` VARCHAR(24) NULL,
    MODIFY `destination` VARCHAR(24) NULL,
    ADD COLUMN `waitlistSource` VARCHAR(24) NULL,
    ADD COLUMN `contactName` VARCHAR(120) NULL,
    ADD COLUMN `nominatedByUserId` VARCHAR(191) NULL,
    ADD COLUMN `admittedOrgId` VARCHAR(191) NULL,
    ADD COLUMN `admittedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `team_interest_waitlistSource_createdAt_idx` ON `team_interest`(`waitlistSource`, `createdAt`);

-- AlterTable
ALTER TABLE `organisations` ADD COLUMN `trialEndsAt` DATETIME(3) NULL;
