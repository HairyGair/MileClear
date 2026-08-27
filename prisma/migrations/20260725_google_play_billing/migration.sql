-- Google Play Billing: link a Play subscription to a MileClear account.
--
-- googlePlayPurchaseToken is the Android analogue of
-- appleOriginalTransactionId. Play tokens are long (typically ~250 chars but
-- unbounded in the docs), so 512 with a unique index — 512 * 4 bytes for
-- utf8mb4 is 2048, comfortably inside InnoDB's 3072-byte index limit.
--
-- NOT YET APPLIED TO PRODUCTION. Run with the Android release, not before:
-- the columns are inert until /billing/google is live.
ALTER TABLE `users`
  ADD COLUMN `googlePlayPurchaseToken` VARCHAR(512) NULL,
  ADD COLUMN `googlePlayOrderId` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `users_googlePlayPurchaseToken_key`
  ON `users`(`googlePlayPurchaseToken`);
