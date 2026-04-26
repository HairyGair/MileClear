-- CreateTable
CREATE TABLE `hmrc_reconciliations` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `taxYear` VARCHAR(7) NOT NULL,
    `platform` VARCHAR(40) NOT NULL,
    `hmrcReportedPence` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hmrc_reconciliations_userId_taxYear_idx`(`userId`, `taxYear`),
    UNIQUE INDEX `hmrc_reconciliations_userId_taxYear_platform_key`(`userId`, `taxYear`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pickup_waits` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `locationName` VARCHAR(255) NULL,
    `locationLat` DOUBLE NULL,
    `locationLng` DOUBLE NULL,
    `platform` VARCHAR(40) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pickup_waits_userId_startedAt_idx`(`userId`, `startedAt`),
    INDEX `pickup_waits_locationName_idx`(`locationName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hmrc_reconciliations` ADD CONSTRAINT `hmrc_reconciliations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pickup_waits` ADD CONSTRAINT `pickup_waits_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
