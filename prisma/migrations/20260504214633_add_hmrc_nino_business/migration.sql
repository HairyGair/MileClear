-- AlterTable
ALTER TABLE `hmrc_connections` ADD COLUMN `businessId` VARCHAR(40) NULL,
    ADD COLUMN `nino` VARCHAR(13) NULL;
