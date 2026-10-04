-- Mileage record certificates (4 Oct 2026, Pro). One row per certificate a
-- driver makes. `snapshot` is the frozen figures as issued; `code` is the
-- unguessable key of the public page mileclear.com/verify/<code>.
-- New table only: no backfill, nothing else changes.

-- CreateTable
CREATE TABLE `mileage_certificates` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `vehicleId` VARCHAR(191) NULL,
    `snapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `mileage_certificates_code_key`(`code`),
    INDEX `mileage_certificates_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mileage_certificates` ADD CONSTRAINT `mileage_certificates_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
