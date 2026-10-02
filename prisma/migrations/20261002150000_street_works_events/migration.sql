-- CreateTable: street_works_events
-- Road alerts trial (2 Oct 2026): planned and live street works from DfT
-- Street Manager open data (AWS SNS push to /road-alerts/street-manager/sns).
-- New table only; nothing existing changes. Safe to deploy before the SNS
-- subscription exists: the receiver is a no-op until
-- STREET_MANAGER_SNS_ENABLED=1.
CREATE TABLE `street_works_events` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(64) NOT NULL,
    `objectType` VARCHAR(16) NOT NULL,
    `trafficManagement` VARCHAR(40) NOT NULL,
    `isTrafficSensitive` BOOLEAN NOT NULL DEFAULT false,
    `workStatus` VARCHAR(40) NULL,
    `streetName` VARCHAR(200) NULL,
    `town` VARCHAR(100) NULL,
    `areaName` VARCHAR(200) NULL,
    `highwayAuthority` VARCHAR(200) NULL,
    `promoter` VARCHAR(200) NULL,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `minLat` DOUBLE NOT NULL,
    `maxLat` DOUBLE NOT NULL,
    `minLng` DOUBLE NOT NULL,
    `maxLng` DOUBLE NOT NULL,
    `geometry` JSON NOT NULL,
    `lastEventAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `street_works_events_reference_key`(`reference`),
    INDEX `street_works_events_minLat_minLng_idx`(`minLat`, `minLng`),
    INDEX `street_works_events_endAt_idx`(`endAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
