-- MileClear Teams Phase 1 (23 Aug 2026). TPS360 design-partner pilot:
-- organisations, memberships with invite tokens (sha256 at rest, per the
-- accountant-share discipline), and nothing billing-related yet - pilot
-- orgs are free by flag until Phase 3.
CREATE TABLE `organisations` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `pilotFree` BOOLEAN NOT NULL DEFAULT true,
  `defaultRatePence` INTEGER NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `org_memberships` (
  `id` VARCHAR(191) NOT NULL,
  `orgId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `role` VARCHAR(10) NOT NULL DEFAULT 'driver',
  `status` VARCHAR(10) NOT NULL DEFAULT 'invited',
  `invitedEmail` VARCHAR(255) NOT NULL,
  `inviteTokenHash` VARCHAR(64) NULL,
  `inviteExpiresAt` DATETIME(3) NULL,
  `invitedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `acceptedAt` DATETIME(3) NULL,
  `disabledAt` DATETIME(3) NULL,
  UNIQUE INDEX `org_memberships_inviteTokenHash_key` (`inviteTokenHash`),
  UNIQUE INDEX `org_memberships_orgId_invitedEmail_key` (`orgId`, `invitedEmail`),
  INDEX `org_memberships_userId_status_idx` (`userId`, `status`),
  INDEX `org_memberships_orgId_status_idx` (`orgId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `organisations` ADD CONSTRAINT `organisations_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `org_memberships` ADD CONSTRAINT `org_memberships_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organisations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `org_memberships` ADD CONSTRAINT `org_memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
