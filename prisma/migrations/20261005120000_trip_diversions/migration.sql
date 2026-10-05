-- Diversion labels (5 Oct 2026): one row per GPS trip that went round a
-- planned road closure on the driver's usual route. New table only: no
-- backfill here, nothing else changes, trips are never edited.

-- CreateTable
CREATE TABLE `trip_diversions` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `closureRef` VARCHAR(64) NOT NULL,
    `streetName` VARCHAR(200) NULL,
    `town` VARCHAR(100) NULL,
    `promoter` VARCHAR(200) NULL,
    `usualMiles` DOUBLE NOT NULL,
    `extraMiles` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `trip_diversions_tripId_key`(`tripId`),
    INDEX `trip_diversions_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trip_diversions` ADD CONSTRAINT `trip_diversions_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
