-- CreateTable
CREATE TABLE `practices` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `contactName` VARCHAR(120) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `professionalBody` VARCHAR(16) NULL,
    `arn` VARCHAR(20) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'unchecked',
    `checkedAt` DATETIME(3) NULL,
    `checkedByUserId` VARCHAR(36) NULL,
    `suspendedAt` DATETIME(3) NULL,
    `joinCode` VARCHAR(16) NOT NULL,
    `reportCount` INTEGER NOT NULL DEFAULT 0,
    `lastReportedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `practices_joinCode_key`(`joinCode`),
    INDEX `practices_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_logos` (
    `practiceId` VARCHAR(191) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `mime` VARCHAR(40) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `checkedAt` DATETIME(3) NULL,

    PRIMARY KEY (`practiceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_members` (
    `id` VARCHAR(191) NOT NULL,
    `practiceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `role` VARCHAR(8) NOT NULL DEFAULT 'staff',
    `status` VARCHAR(10) NOT NULL DEFAULT 'invited',
    `invitedEmail` VARCHAR(255) NOT NULL,
    `inviteTokenHash` VARCHAR(64) NULL,
    `inviteExpiresAt` DATETIME(3) NULL,
    `invitedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `removedAt` DATETIME(3) NULL,

    UNIQUE INDEX `practice_members_inviteTokenHash_key`(`inviteTokenHash`),
    INDEX `practice_members_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `practice_members_practiceId_invitedEmail_key`(`practiceId`, `invitedEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_links` (
    `id` VARCHAR(191) NOT NULL,
    `practiceId` VARCHAR(191) NULL,
    `clientUserId` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'invited',
    `startedBy` VARCHAR(10) NOT NULL,
    `invitedEmail` VARCHAR(255) NULL,
    `invitedName` VARCHAR(120) NULL,
    `invitedPracticeEmail` VARCHAR(255) NULL,
    `inviteTokenHash` VARCHAR(64) NULL,
    `inviteExpiresAt` DATETIME(3) NULL,
    `invitedAt` DATETIME(3) NULL,
    `lastResentAt` DATETIME(3) NULL,
    `createdByMemberId` VARCHAR(36) NULL,
    `shareEarnings` BOOLEAN NOT NULL DEFAULT true,
    `shareExpenses` BOOLEAN NOT NULL DEFAULT true,
    `sharePersonalTrips` BOOLEAN NOT NULL DEFAULT false,
    `consentedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `renewalAskedAt` DATETIME(3) NULL,
    `renewalRemindedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `endedBy` VARCHAR(10) NULL,
    `askedAgainAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `practice_links_inviteTokenHash_key`(`inviteTokenHash`),
    INDEX `practice_links_clientUserId_status_idx`(`clientUserId`, `status`),
    INDEX `practice_links_practiceId_status_idx`(`practiceId`, `status`),
    INDEX `practice_links_invitedEmail_idx`(`invitedEmail`),
    INDEX `practice_links_invitedPracticeEmail_idx`(`invitedPracticeEmail`),
    UNIQUE INDEX `practice_links_practiceId_clientUserId_key`(`practiceId`, `clientUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_requests` (
    `id` VARCHAR(191) NOT NULL,
    `practiceId` VARCHAR(191) NOT NULL,
    `clientUserId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `note` VARCHAR(300) NULL,
    `dueDate` DATE NULL,
    `periodStart` DATE NULL,
    `periodEnd` DATE NULL,
    `countAtSend` INTEGER NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'open',
    `doneHow` VARCHAR(8) NULL,
    `doneAt` DATETIME(3) NULL,
    `driverReply` VARCHAR(200) NULL,
    `repliedAt` DATETIME(3) NULL,
    `lastRemindedAt` DATETIME(3) NULL,
    `createdByMemberId` VARCHAR(36) NULL,
    `createdByName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `practice_requests_practiceId_status_idx`(`practiceId`, `status`),
    INDEX `practice_requests_clientUserId_status_idx`(`clientUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_access_logs` (
    `id` VARCHAR(191) NOT NULL,
    `practiceId` VARCHAR(191) NULL,
    `practiceName` VARCHAR(160) NOT NULL,
    `memberId` VARCHAR(36) NULL,
    `actorName` VARCHAR(120) NULL,
    `clientUserId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(24) NOT NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `practice_access_logs_clientUserId_createdAt_idx`(`clientUserId`, `createdAt`),
    INDEX `practice_access_logs_practiceId_createdAt_idx`(`practiceId`, `createdAt`),
    INDEX `practice_access_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `practice_logos` ADD CONSTRAINT `practice_logos_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `practices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_members` ADD CONSTRAINT `practice_members_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `practices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_members` ADD CONSTRAINT `practice_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_links` ADD CONSTRAINT `practice_links_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `practices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_links` ADD CONSTRAINT `practice_links_clientUserId_fkey` FOREIGN KEY (`clientUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_requests` ADD CONSTRAINT `practice_requests_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `practices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_requests` ADD CONSTRAINT `practice_requests_clientUserId_fkey` FOREIGN KEY (`clientUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_access_logs` ADD CONSTRAINT `practice_access_logs_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `practices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_access_logs` ADD CONSTRAINT `practice_access_logs_clientUserId_fkey` FOREIGN KEY (`clientUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

