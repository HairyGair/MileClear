-- CreateTable
CREATE TABLE `feedback` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `displayName` VARCHAR(100) NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'feature_request',
    `status` VARCHAR(191) NOT NULL DEFAULT 'new',
    `upvoteCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `feedback_status_idx`(`status`),
    INDEX `feedback_category_idx`(`category`),
    INDEX `feedback_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback_votes` (
    `id` VARCHAR(191) NOT NULL,
    `feedbackId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `feedback_votes_feedbackId_userId_key`(`feedbackId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feedback` ADD CONSTRAINT `feedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_votes` ADD CONSTRAINT `feedback_votes_feedbackId_fkey` FOREIGN KEY (`feedbackId`) REFERENCES `feedback`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_votes` ADD CONSTRAINT `feedback_votes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
