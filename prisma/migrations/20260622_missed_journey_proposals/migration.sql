-- CreateTable: missed_journey_proposals
-- Retrospective "missed journey" scanner. A gap between two consecutive captured
-- trips (trip A ended at one place, trip B started elsewhere with a plausible
-- time gap and no trip between) implies an uncaptured drive. We propose it so the
-- user can add it in one tap. `key` (derived from the bracketing trip ids) dedups
-- proposals across scans; `status` stops re-nagging once accepted or dismissed.
CREATE TABLE `missed_journey_proposals` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'proposed',
    `fromLat` DOUBLE NOT NULL,
    `fromLng` DOUBLE NOT NULL,
    `toLat` DOUBLE NOT NULL,
    `toLng` DOUBLE NOT NULL,
    `fromAddress` TEXT NULL,
    `toAddress` TEXT NULL,
    `departedAt` DATETIME(3) NOT NULL,
    `arrivedAt` DATETIME(3) NOT NULL,
    `estimatedMiles` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `missed_journey_proposals_userId_key_key`(`userId`, `key`),
    INDEX `missed_journey_proposals_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `missed_journey_proposals` ADD CONSTRAINT `missed_journey_proposals_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
