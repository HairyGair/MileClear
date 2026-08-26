-- MileClear Teams phase 2 + 3 (24 Aug 2026).
--
-- team_approvals: one row per driver per month, the manager's sign-off.
-- Miles and amount are snapshotted at approval so a later trip edit cannot
-- silently change what was signed off.
--
-- organisations gains per-seat billing columns; they stay NULL while an org
-- is a free pilot (TPS360), and seatsBilled records the quantity last synced
-- to Stripe so we only call out when the seat count actually changes.
CREATE TABLE `team_approvals` (
  `id` VARCHAR(191) NOT NULL,
  `orgId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
  `milesAtApproval` DOUBLE NULL,
  `amountPenceAtApproval` INTEGER NULL,
  `note` TEXT NULL,
  `approvedByUserId` VARCHAR(191) NULL,
  `approvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `team_approvals_orgId_userId_month_key` (`orgId`, `userId`, `month`),
  INDEX `team_approvals_orgId_month_idx` (`orgId`, `month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `team_approvals` ADD CONSTRAINT `team_approvals_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organisations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `team_approvals` ADD CONSTRAINT `team_approvals_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `organisations`
  ADD COLUMN `stripeCustomerId` VARCHAR(255) NULL,
  ADD COLUMN `stripeSubscriptionId` VARCHAR(255) NULL,
  ADD COLUMN `billingEmail` VARCHAR(255) NULL,
  ADD COLUMN `seatsBilled` INTEGER NULL,
  ADD UNIQUE INDEX `organisations_stripeCustomerId_key` (`stripeCustomerId`),
  ADD UNIQUE INDEX `organisations_stripeSubscriptionId_key` (`stripeSubscriptionId`);
