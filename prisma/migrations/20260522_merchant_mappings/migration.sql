-- Phase 2 of the "Money Picture" stack (22 May 2026).
-- Per-user learned merchant → category mappings. Look-up key is
-- (userId, merchantKey, kind). Confidence is derived at read time
-- from acceptCount; overrideCount is tracked for future UX prompts.

CREATE TABLE `merchant_mappings` (
  `id`            VARCHAR(191) NOT NULL,
  `userId`        VARCHAR(191) NOT NULL,
  `merchantKey`   VARCHAR(120) NOT NULL,
  `kind`          VARCHAR(20)  NOT NULL,
  `category`      VARCHAR(50)  NOT NULL,
  `acceptCount`   INT          NOT NULL DEFAULT 1,
  `overrideCount` INT          NOT NULL DEFAULT 0,
  `lastUsedAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `merchant_mappings_userId_merchantKey_kind_key`
    (`userId`, `merchantKey`, `kind`),
  INDEX `merchant_mappings_userId_lastUsedAt_idx`
    (`userId`, `lastUsedAt`),

  CONSTRAINT `merchant_mappings_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
