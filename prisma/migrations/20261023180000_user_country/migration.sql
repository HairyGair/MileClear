-- AlterTable: users.country
-- Where the driver drives, ISO 3166-1 alpha-2. Decides which UK-only
-- features (HMRC tax, DVLA, fuel prices...) they see. Every existing driver
-- is GB, so nothing changes for them.
ALTER TABLE `users` ADD COLUMN `country` VARCHAR(2) NOT NULL DEFAULT 'GB';
