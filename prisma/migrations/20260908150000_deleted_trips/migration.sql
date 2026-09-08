-- CreateTable: deleted_trips
-- Archive of deleted trips. DELETE /trips/:id is a hard delete and
-- trip_coordinates cascades, so a swiped-away trip was gone for good. The row
-- is written just before the delete (best-effort) with the full trips row and
-- its coordinates as JSON, so support can restore a trip the user removed by
-- accident, route included. Nothing in the trip read paths touches this table.
-- Rows older than 60 days can be purged by a later retention job.
CREATE TABLE `deleted_trips` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `originalTripId` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedBy` VARCHAR(16) NOT NULL,
    `tripJson` JSON NOT NULL,
    `coordinatesJson` JSON NOT NULL,
    `restoredTripId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,

    INDEX `deleted_trips_userId_deletedAt_idx`(`userId`, `deletedAt`),
    INDEX `deleted_trips_originalTripId_idx`(`originalTripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `deleted_trips` ADD CONSTRAINT `deleted_trips_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
