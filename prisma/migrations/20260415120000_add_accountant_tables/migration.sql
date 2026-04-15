-- CreateTable
CREATE TABLE `accountant_invites` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `accountant_invites_token_key`(`token`),
    INDEX `accountant_invites_userId_idx`(`userId`),
    INDEX `accountant_invites_token_idx`(`token`),
    INDEX `accountant_invites_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accountant_access` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accountantEmail` VARCHAR(255) NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `permissions` VARCHAR(50) NOT NULL DEFAULT 'read',
    `lastAccessedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `accountant_access_token_key`(`token`),
    UNIQUE INDEX `accountant_access_userId_accountantEmail_key`(`userId`, `accountantEmail`),
    INDEX `accountant_access_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accountant_invites` ADD CONSTRAINT `accountant_invites_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accountant_access` ADD CONSTRAINT `accountant_access_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
