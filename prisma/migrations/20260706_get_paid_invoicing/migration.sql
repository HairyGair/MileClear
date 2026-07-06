-- Get Paid invoicing engine (Jul 2026). Entirely additive: new tables +
-- nullable/default columns only. Covers Phases 1-4 so prod DDL runs once.

-- Client book
CREATE TABLE `clients` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `email` VARCHAR(255) NULL,
  `phone` VARCHAR(40) NULL,
  `addressLine1` VARCHAR(200) NULL,
  `addressLine2` VARCHAR(200) NULL,
  `city` VARCHAR(100) NULL,
  `postcode` VARCHAR(20) NULL,
  `notes` TEXT NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `clients_userId_archivedAt_idx`(`userId`, `archivedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `clients` ADD CONSTRAINT `clients_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoice line items
CREATE TABLE `invoice_line_items` (
  `id` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `description` VARCHAR(300) NOT NULL,
  `quantity` DECIMAL(10, 2) NOT NULL,
  `unitPricePence` INTEGER NOT NULL,
  `totalPence` INTEGER NOT NULL,
  INDEX `invoice_line_items_invoiceId_position_idx`(`invoiceId`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `invoice_line_items` ADD CONSTRAINT `invoice_line_items_invoiceId_fkey`
  FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Uploaded business logos (1:1 with users; blob kept off User queries)
CREATE TABLE `user_logos` (
  `userId` VARCHAR(191) NOT NULL,
  `data` MEDIUMBLOB NOT NULL,
  `mime` VARCHAR(40) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_logos` ADD CONSTRAINT `user_logos_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoice email history (sends + chases; Brevo-cap counting)
CREATE TABLE `invoice_emails` (
  `id` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `toEmail` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'sent',
  `error` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `invoice_emails_invoiceId_createdAt_idx`(`invoiceId`, `createdAt`),
  INDEX `invoice_emails_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `invoice_emails` ADD CONSTRAINT `invoice_emails_invoiceId_fkey`
  FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoice builder columns (all nullable; amountPence stays the gross total)
ALTER TABLE `invoices`
  ADD COLUMN `clientId` VARCHAR(191) NULL,
  ADD COLUMN `invoiceNumber` INTEGER NULL,
  ADD COLUMN `subtotalPence` INTEGER NULL,
  ADD COLUMN `vatRate` INTEGER NULL,
  ADD COLUMN `vatPence` INTEGER NULL,
  ADD COLUMN `emailedAt` DATETIME(3) NULL,
  ADD COLUMN `autoChaseEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `chaseCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `nextChaseAt` DATETIME(3) NULL,
  ADD COLUMN `chaseWarnedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `invoices_userId_invoiceNumber_key` ON `invoices`(`userId`, `invoiceNumber`);
CREATE INDEX `invoices_nextChaseAt_idx` ON `invoices`(`nextChaseAt`);

ALTER TABLE `invoices` ADD CONSTRAINT `invoices_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Business profile on users (bank details AES-256-GCM encrypted at rest)
ALTER TABLE `users`
  ADD COLUMN `tradingName` VARCHAR(120) NULL,
  ADD COLUMN `businessAddress` TEXT NULL,
  ADD COLUMN `vatRegistered` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `vatNumber` VARCHAR(20) NULL,
  ADD COLUMN `invoiceAccentColor` VARCHAR(7) NULL,
  ADD COLUMN `invoicePaymentTermsDays` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `bankAccountName` VARCHAR(120) NULL,
  ADD COLUMN `bankSortCode` VARCHAR(200) NULL,
  ADD COLUMN `bankAccountNumber` VARCHAR(200) NULL,
  ADD COLUMN `invoiceCounter` INTEGER NOT NULL DEFAULT 0;

-- Phase 4: bank-payment reconciliation marker
ALTER TABLE `bank_transactions` ADD COLUMN `resolvedInvoiceId` VARCHAR(191) NULL;
