-- CreateTable
CREATE TABLE `geofence_radius_observations` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `locationType` VARCHAR(16) NOT NULL,
    `distanceMeters` DOUBLE NOT NULL,
    `countryCode` VARCHAR(2) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `geofence_radius_observations_locationType_recordedAt_idx`(`locationType`, `recordedAt`),
    INDEX `geofence_radius_observations_userId_recordedAt_idx`(`userId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `geofence_radius_recommendations` (
    `id` VARCHAR(191) NOT NULL,
    `locationType` VARCHAR(16) NOT NULL,
    `countryCode` VARCHAR(2) NULL,
    `p75Meters` DOUBLE NOT NULL,
    `sampleSize` INTEGER NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `geofence_radius_recommendations_locationType_countryCode_key`(`locationType`, `countryCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
