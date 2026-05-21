-- Phase 1 of the "Money Picture" stack (22 May 2026).
-- Raw TrueLayer imports land in bank_transactions before being triaged
-- into the existing earnings / expenses tables via the inbox UI.
-- Idempotent on (userId, externalId).

CREATE TABLE `bank_transactions` (
  `id`                  VARCHAR(191) NOT NULL,
  `userId`              VARCHAR(191) NOT NULL,
  `plaidConnectionId`   VARCHAR(191) NOT NULL,
  `externalId`          VARCHAR(128) NOT NULL,
  `merchant`            VARCHAR(200) NOT NULL,
  `descriptionRaw`      TEXT         NULL,
  `amountPence`         INT          NOT NULL,
  `currency`            VARCHAR(3)   NOT NULL DEFAULT 'GBP',
  `transactionDate`     DATE         NOT NULL,
  `status`              VARCHAR(20)  NOT NULL DEFAULT 'pending',
  `suggestedKind`       VARCHAR(20)  NULL,
  `suggestedCategory`   VARCHAR(50)  NULL,
  `suggestedConfidence` INT          NULL,
  `resolvedEarningId`   VARCHAR(191) NULL,
  `resolvedExpenseId`   VARCHAR(191) NULL,
  `reviewedAt`          DATETIME(3)  NULL,
  `createdAt`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `bank_transactions_userId_externalId_key` (`userId`, `externalId`),
  INDEX `bank_transactions_userId_status_transactionDate_idx`
    (`userId`, `status`, `transactionDate`),

  CONSTRAINT `bank_transactions_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
