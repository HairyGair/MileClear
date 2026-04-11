-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `lastTripAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `apple_iap_webhook_logs` (
    `id` VARCHAR(191) NOT NULL,
    `notificationType` VARCHAR(100) NULL,
    `subtype` VARCHAR(100) NULL,
    `originalTransactionId` VARCHAR(255) NULL,
    `userId` VARCHAR(191) NULL,
    `status` VARCHAR(30) NOT NULL,
    `errorMessage` TEXT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `apple_iap_webhook_logs_receivedAt_idx`(`receivedAt`),
    INDEX `apple_iap_webhook_logs_status_receivedAt_idx`(`status`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_runs` (
    `id` VARCHAR(191) NOT NULL,
    `jobName` VARCHAR(100) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` VARCHAR(20) NOT NULL,
    `errorMessage` TEXT NULL,
    `metadata` TEXT NULL,

    INDEX `job_runs_jobName_startedAt_idx`(`jobName`, `startedAt`),
    INDEX `job_runs_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill lastTripAt from existing trips so sort works on existing data
UPDATE `users` u
SET `lastTripAt` = (
    SELECT MAX(t.`startedAt`)
    FROM `trips` t
    WHERE t.`userId` = u.`id`
);
