-- AlterTable
ALTER TABLE `fuel_logs` ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL;

-- CreateIndex
CREATE INDEX `fuel_logs_latitude_longitude_idx` ON `fuel_logs`(`latitude`, `longitude`);
