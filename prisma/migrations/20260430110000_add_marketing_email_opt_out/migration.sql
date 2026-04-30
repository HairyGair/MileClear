-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `marketingEmailsEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `marketingEmailsDisabledAt` DATETIME(3) NULL,
    ADD COLUMN `marketingEmailsDisabledSource` VARCHAR(32) NULL;
