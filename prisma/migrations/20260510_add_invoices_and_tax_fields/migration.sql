-- Add PAYE-tax-paid + tax-basis fields to users for mixed-mode tax computations.
ALTER TABLE `users`
    ADD COLUMN `payeAnnualPaidTaxPence` INT NULL,
    ADD COLUMN `taxBasis` VARCHAR(16) NOT NULL DEFAULT 'cash';

-- Sole-trader invoice tracker (Laura Joyce request 10 May 2026).
-- Simple list-and-status surface; collections-workflow features (Late
-- Payment of Commercial Debts Act interest, formal letters) deliberately
-- deferred per user feedback.
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `company` VARCHAR(200) NOT NULL,
    `reference` VARCHAR(80) NULL,
    `amountPence` INTEGER NOT NULL,
    `sentAt` DATE NOT NULL,
    `dueAt` DATE NOT NULL,
    `paidAt` DATE NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'sent',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `invoices_userId_status_idx`(`userId`, `status`),
    INDEX `invoices_userId_sentAt_idx`(`userId`, `sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `invoices` ADD CONSTRAINT `invoices_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
