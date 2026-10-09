-- Running odometer (9 Oct 2026). Dashboard readings the driver types in,
-- kept as rows so the daily odometer log can use the reading that applied on
-- each past day. New table only: nothing existing changes.

-- CreateTable
CREATE TABLE `odometer_readings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `readingMiles` DOUBLE NOT NULL,
    `readAt` DATETIME(3) NOT NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'user',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `odometer_readings_vehicleId_readAt_idx`(`vehicleId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `odometer_readings` ADD CONSTRAINT `odometer_readings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `odometer_readings` ADD CONSTRAINT `odometer_readings_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
