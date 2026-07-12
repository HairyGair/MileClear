-- Xero integration: connection + idempotency tables.
CREATE TABLE `xero_connections` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(64) NOT NULL,
  `tenantName` VARCHAR(200) NULL,
  `accessTokenEncrypted` TEXT NOT NULL,
  `refreshTokenEncrypted` TEXT NOT NULL,
  `tokenExpiresAt` DATETIME(3) NOT NULL,
  `expenseAccountCode` VARCHAR(20) NULL,
  `payFromAccountId` VARCHAR(64) NULL,
  `lastSyncedAt` DATETIME(3) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `xero_connections_userId_key`(`userId`),
  INDEX `xero_connections_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `xero_synced_items` (
  `id` VARCHAR(191) NOT NULL,
  `connectionId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `itemKey` VARCHAR(120) NOT NULL,
  `xeroEntityId` VARCHAR(64) NOT NULL,
  `xeroEntityType` VARCHAR(40) NOT NULL DEFAULT 'BankTransaction',
  `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `xero_synced_items_userId_itemKey_key`(`userId`, `itemKey`),
  INDEX `xero_synced_items_connectionId_idx`(`connectionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `xero_connections` ADD CONSTRAINT `xero_connections_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `xero_synced_items` ADD CONSTRAINT `xero_synced_items_connectionId_fkey`
  FOREIGN KEY (`connectionId`) REFERENCES `xero_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
