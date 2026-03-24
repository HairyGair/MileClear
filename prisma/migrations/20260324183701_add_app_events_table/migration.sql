-- CreateTable
CREATE TABLE `app_events` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `app_events_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `app_events_createdAt_idx`(`createdAt`),
    INDEX `app_events_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_events` ADD CONSTRAINT `app_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
