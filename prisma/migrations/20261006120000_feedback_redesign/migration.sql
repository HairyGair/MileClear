-- Feedback redesign (6 Oct 2026). Problem reports from the app become
-- private conversations in the support inbox (channel 'app', phone details
-- in context, screenshots in support_attachments); ideas get a shipped note
-- for "You asked, we built". New columns have defaults or are nullable:
-- existing rows and existing email threads are unchanged.

-- AlterTable
ALTER TABLE `support_emails` ADD COLUMN `channel` VARCHAR(16) NOT NULL DEFAULT 'email',
    ADD COLUMN `context` JSON NULL,
    ADD COLUMN `readByUserAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `feedback` ADD COLUMN `shippedNote` VARCHAR(500) NULL,
    ADD COLUMN `shippedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `support_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `supportEmailId` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(40) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_attachments_supportEmailId_idx`(`supportEmailId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `support_attachments` ADD CONSTRAINT `support_attachments_supportEmailId_fkey` FOREIGN KEY (`supportEmailId`) REFERENCES `support_emails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
