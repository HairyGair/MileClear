-- Scottish taxpayer setting (11 Oct 2026). Drivers who live in Scotland pay
-- Scottish Income Tax on their profits and wages, with different bands.
-- Nullable column: null means not asked yet and is treated as no, so nothing
-- changes for any existing account.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `scottishTaxpayer` BOOLEAN NULL;
