-- Seat cap for pilot orgs (25 Aug 2026). Null = uncapped. Free pilots are
-- capped at 20 so a free pilot cannot silently become a free 400-driver fleet.
ALTER TABLE `organisations` ADD COLUMN `seatCap` INTEGER NULL;
