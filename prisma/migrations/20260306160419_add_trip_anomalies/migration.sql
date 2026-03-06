-- CreateTable
CREATE TABLE `trip_anomalies` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `response` VARCHAR(191) NOT NULL,
    `customNote` TEXT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `trip_anomalies_type_idx`(`type`),
    INDEX `trip_anomalies_lat_lng_idx`(`lat`, `lng`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trip_anomalies` ADD CONSTRAINT `trip_anomalies_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_anomalies` ADD CONSTRAINT `trip_anomalies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
