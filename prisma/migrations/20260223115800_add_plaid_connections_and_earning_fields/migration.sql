-- AlterTable
ALTER TABLE `earnings` ADD COLUMN `externalId` VARCHAR(255) NULL,
    ADD COLUMN `notes` TEXT NULL;

-- CreateTable
CREATE TABLE `plaid_connections` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NULL,
    `institutionName` VARCHAR(191) NULL,
    `accessToken` VARCHAR(500) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `lastSynced` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plaid_connections_itemId_key`(`itemId`),
    INDEX `plaid_connections_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `earnings_userId_externalId_key` ON `earnings`(`userId`, `externalId`);

-- AddForeignKey
ALTER TABLE `plaid_connections` ADD CONSTRAINT `plaid_connections_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
