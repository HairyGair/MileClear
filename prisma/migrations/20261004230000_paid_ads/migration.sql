-- Paid ads (4 Oct 2026): Meta campaign figures synced daily for the admin.
-- New tables only: no backfill, nothing else changes.

-- CreateTable
CREATE TABLE `ad_campaigns` (
    `id` VARCHAR(64) NOT NULL,
    `accountId` VARCHAR(64) NOT NULL,
    `accountName` VARCHAR(255) NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` VARCHAR(32) NULL,
    `objective` VARCHAR(64) NULL,
    `startTime` DATETIME(3) NULL,
    `stopTime` DATETIME(3) NULL,
    `currency` VARCHAR(8) NOT NULL,
    `spendPence` INTEGER NOT NULL DEFAULT 0,
    `impressions` INTEGER NOT NULL DEFAULT 0,
    `reach` INTEGER NOT NULL DEFAULT 0,
    `linkClicks` INTEGER NOT NULL DEFAULT 0,
    `fromSource` VARCHAR(40) NULL,
    `syncedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ad_daily_stats` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(64) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `spendPence` INTEGER NOT NULL,
    `impressions` INTEGER NOT NULL,
    `reach` INTEGER NOT NULL,
    `linkClicks` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ad_daily_stats_campaignId_idx`(`campaignId`),
    UNIQUE INDEX `ad_daily_stats_campaignId_date_key`(`campaignId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
