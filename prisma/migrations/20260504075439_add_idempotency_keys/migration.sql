-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `statusCode` INTEGER NOT NULL,
    `responseBody` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `idempotency_keys_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `idempotency_keys_userId_key_key`(`userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
