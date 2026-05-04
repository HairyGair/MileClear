-- AlterTable
ALTER TABLE `app_events` ADD COLUMN `appVersion` VARCHAR(32) NULL,
    ADD COLUMN `buildNumber` VARCHAR(32) NULL;

-- CreateIndex
CREATE INDEX `app_events_buildNumber_type_createdAt_idx` ON `app_events`(`buildNumber`, `type`, `createdAt`);
