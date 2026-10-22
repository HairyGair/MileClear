-- AlterTable: users.payoutsInArrears
-- Apps the driver says pay a week behind (JSON array of platform values).
-- Bank payouts from them are dated to the week before they landed.
-- One new nullable column; nothing existing changes.
ALTER TABLE `users` ADD COLUMN `payoutsInArrears` JSON NULL;
