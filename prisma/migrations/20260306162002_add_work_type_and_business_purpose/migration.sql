-- AlterTable
ALTER TABLE `trips` ADD COLUMN `businessPurpose` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `employerMileageRatePence` INTEGER NULL,
    ADD COLUMN `workType` VARCHAR(20) NOT NULL DEFAULT 'gig';
