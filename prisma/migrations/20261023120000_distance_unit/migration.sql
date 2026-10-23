-- AlterTable: users.distanceUnit
-- Distances shown in the app ("miles" or "km"). Display only: stored
-- distances stay in miles. Every existing driver keeps miles.
ALTER TABLE `users` ADD COLUMN `distanceUnit` VARCHAR(8) NOT NULL DEFAULT 'miles';
