-- AlterTable
ALTER TABLE `users` ADD COLUMN `autoRecordingActive` BOOLEAN NULL,
    ADD COLUMN `backgroundFetchStatus` VARCHAR(16) NULL,
    ADD COLUMN `daysSinceLastTrip` INTEGER NULL,
    ADD COLUMN `freeDiskBytes` BIGINT NULL,
    ADD COLUMN `lastDrivingSpeedAt` DATETIME(3) NULL,
    ADD COLUMN `lastSyncQueueFailed` INTEGER NULL,
    ADD COLUMN `lastSyncQueuePermFailed` INTEGER NULL,
    ADD COLUMN `recordingStartedAt` DATETIME(3) NULL,
    ADD COLUMN `secondsSinceLastTripPost` INTEGER NULL;
