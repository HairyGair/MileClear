-- "MileClear for teams" interest register (21 Aug 2026).
--
-- A company asked for a manager portal with approval; 95% of our users are
-- self-employed and nothing like it exists. Rather than build on one
-- request, this table collects who is asking and how big they are, so the
-- employer-tier decision is made from driver counts rather than memory.
CREATE TABLE `team_interest` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `company` VARCHAR(160) NULL,
  `drivers` VARCHAR(8) NOT NULL,
  `approval` VARCHAR(24) NOT NULL,
  `destination` VARCHAR(24) NOT NULL,
  `destinationDetail` VARCHAR(160) NULL,
  `notes` TEXT NULL,
  `source` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `team_interest_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
