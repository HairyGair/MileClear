-- Support inbox (4 Oct 2026): emails to support@ and replies sent from the
-- admin. New table only: no backfill, nothing else changes.

-- CreateTable
CREATE TABLE `support_emails` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(255) NOT NULL,
    `threadKey` VARCHAR(255) NOT NULL,
    `direction` VARCHAR(8) NOT NULL,
    `fromEmail` VARCHAR(255) NOT NULL,
    `fromName` VARCHAR(255) NULL,
    `toEmail` VARCHAR(255) NULL,
    `subject` VARCHAR(500) NOT NULL,
    `textBody` MEDIUMTEXT NOT NULL,
    `inReplyTo` VARCHAR(255) NULL,
    `attachments` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `isSpam` BOOLEAN NOT NULL DEFAULT false,
    `sentByUserId` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `support_emails_messageId_key`(`messageId`),
    INDEX `support_emails_threadKey_receivedAt_idx`(`threadKey`, `receivedAt`),
    INDEX `support_emails_status_receivedAt_idx`(`status`, `receivedAt`),
    INDEX `support_emails_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `support_emails` ADD CONSTRAINT `support_emails_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
