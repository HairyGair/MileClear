-- Trip facts (11 Oct 2026, decision T-F). Three small facts about how a trip
-- was made, so the Trips tab can label trips drivers don't recognise. New
-- nullable columns only: no existing column or row changes, older trips stay
-- null and show no label.

-- AlterTable
ALTER TABLE `trips` ADD COLUMN `recordedBy` VARCHAR(20) NULL,
    ADD COLUMN `splitFromTripId` VARCHAR(36) NULL,
    ADD COLUMN `splitPart` INTEGER NULL,
    ADD COLUMN `splitPartCount` INTEGER NULL,
    ADD COLUMN `joinedCount` INTEGER NULL;
