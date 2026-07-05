-- Optional client email on invoices. Pre-addresses the late-payment chase
-- email draft (opens in the user's own mail app - MileClear never contacts
-- the client directly). Laura Joyce request, 4 Jul 2026.
ALTER TABLE `invoices` ADD COLUMN `clientEmail` VARCHAR(255) NULL;
