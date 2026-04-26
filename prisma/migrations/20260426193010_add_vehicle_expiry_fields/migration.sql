-- AlterTable
ALTER TABLE `vehicles` ADD COLUMN `lastDvlaCheckAt` DATETIME(3) NULL,
    ADD COLUMN `motExpiryDate` DATETIME(3) NULL,
    ADD COLUMN `motReminderSentAt` DATETIME(3) NULL,
    ADD COLUMN `taxDueDate` DATETIME(3) NULL,
    ADD COLUMN `taxReminderSentAt` DATETIME(3) NULL;
