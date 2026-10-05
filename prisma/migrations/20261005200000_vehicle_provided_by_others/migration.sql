-- Vehicles someone else pays for (5 Oct 2026, Matt Dickens: freelance driver
-- in clients' vans). Their business trips count as miles but are left out of
-- every mileage claim. New column, default off: nothing changes for anyone
-- until a driver switches it on for a vehicle.

-- AlterTable
ALTER TABLE `vehicles` ADD COLUMN `providedByOthers` BOOLEAN NOT NULL DEFAULT false;
