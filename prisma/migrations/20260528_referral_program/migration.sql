-- Referral program (28 May 2026).
-- Each user gets a unique shareable code. When an invited friend signs up AND
-- records their first real trip, the referrer earns a free month of Pro (max 3).
-- referralProUntil banks earned months separately from the Stripe/Apple
-- subscription columns, so a referral month never corrupts subscription state.

ALTER TABLE `users`
  ADD COLUMN `referralCode` VARCHAR(16) NULL,
  ADD COLUMN `referralProUntil` DATETIME(3) NULL,
  ADD COLUMN `referredByCode` VARCHAR(16) NULL;

CREATE UNIQUE INDEX `users_referralCode_key` ON `users`(`referralCode`);

CREATE TABLE `referrals` (
  `id` VARCHAR(191) NOT NULL,
  `referrerId` VARCHAR(191) NOT NULL,
  `refereeId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `rewardGrantedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `referrals_refereeId_key`(`refereeId`),
  INDEX `referrals_referrerId_idx`(`referrerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `referrals`
  ADD CONSTRAINT `referrals_referrerId_fkey`
  FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
