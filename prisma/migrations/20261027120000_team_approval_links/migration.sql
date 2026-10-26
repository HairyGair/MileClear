-- Milesheet (Oct 2026): approve the month from an email link, no account
-- needed. Additive only.
--
-- team_approval_links: one row per emailed link. The token grants one org
-- for one month; only its sha256 is stored.
CREATE TABLE `team_approval_links` (
  `id` VARCHAR(191) NOT NULL,
  `orgId` VARCHAR(191) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `recipientEmail` VARCHAR(255) NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NULL,
  UNIQUE INDEX `team_approval_links_tokenHash_key` (`tokenHash`),
  INDEX `team_approval_links_orgId_month_idx` (`orgId`, `month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `team_approval_links` ADD CONSTRAINT `team_approval_links_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organisations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Who approved from a link (no account behind it). NULL for every existing
-- row and for portal approvals.
ALTER TABLE `team_approvals` ADD COLUMN `approvedByEmail` VARCHAR(255) NULL;
