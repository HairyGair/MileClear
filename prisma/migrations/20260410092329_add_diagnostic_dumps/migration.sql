-- CreateTable
CREATE TABLE `diagnostic_dumps` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL,
    `platform` VARCHAR(10) NOT NULL,
    `osVersion` VARCHAR(20) NOT NULL,
    `appVersion` VARCHAR(20) NOT NULL,
    `buildNumber` VARCHAR(20) NOT NULL,
    `verdict` VARCHAR(20) NOT NULL,
    `statusJson` JSON NOT NULL,
    `eventsJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `diagnostic_dumps_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `diagnostic_dumps` ADD CONSTRAINT `diagnostic_dumps_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
