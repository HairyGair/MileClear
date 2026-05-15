-- CreateTable
CREATE TABLE `apple_iap_ghosts` (
    `originalTransactionId` VARCHAR(255) NOT NULL,
    `dismissedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dismissedBy` VARCHAR(191) NULL,
    `reason` TEXT NULL,

    PRIMARY KEY (`originalTransactionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
