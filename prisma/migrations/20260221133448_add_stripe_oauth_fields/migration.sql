/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `users` ADD COLUMN `stripeCustomerId` VARCHAR(255) NULL,
    ADD COLUMN `stripeSubscriptionId` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_stripeCustomerId_key` ON `users`(`stripeCustomerId`);

-- CreateIndex
CREATE UNIQUE INDEX `users_stripeSubscriptionId_key` ON `users`(`stripeSubscriptionId`);
