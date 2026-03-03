-- AlterTable
ALTER TABLE `users` ADD COLUMN `appleOriginalTransactionId` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_appleOriginalTransactionId_key` ON `users`(`appleOriginalTransactionId`);
