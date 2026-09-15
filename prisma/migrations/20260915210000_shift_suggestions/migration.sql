-- CreateTable: shift_suggestions
-- Proposed shifts. Only 152 of 626 drivers active in the last 30 days ever
-- pressed Start Shift (15 Sep 2026), so the shift scorecard went unused by the
-- rest. A scanner clusters a driver's recent trips into work sessions (3+
-- business trips, gaps under 45 min, spanning 90+ min, none already in a shift)
-- and offers each as a shift. `key` (first and last trip ids) dedups proposals
-- across scans; `status` stops re-nagging once accepted or dismissed.
CREATE TABLE `shift_suggestions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'proposed',
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NOT NULL,
    `tripCount` INTEGER NOT NULL,
    `totalMiles` DOUBLE NOT NULL,
    `platformTag` VARCHAR(191) NULL,
    `tripIdsJson` JSON NOT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shift_suggestions_userId_key_key`(`userId`, `key`),
    INDEX `shift_suggestions_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shift_suggestions` ADD CONSTRAINT `shift_suggestions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
