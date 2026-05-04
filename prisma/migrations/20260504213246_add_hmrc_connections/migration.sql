-- CreateTable
CREATE TABLE `hmrc_connections` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NOT NULL,
    `scope` TEXT NOT NULL,
    `environment` VARCHAR(16) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastStateToken` VARCHAR(64) NULL,
    `connectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `disconnectedAt` DATETIME(3) NULL,

    UNIQUE INDEX `hmrc_connections_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hmrc_connections` ADD CONSTRAINT `hmrc_connections_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
