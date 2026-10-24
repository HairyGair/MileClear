-- AlterTable: vehicles.bluetoothId
-- The car's Bluetooth as the phone reports it, set when a driver links the
-- car with "Use the Bluetooth I'm connected to now". Null for every existing
-- car, so the 42 old typed-in bluetoothName values are not links.
ALTER TABLE `vehicles` ADD COLUMN `bluetoothId` VARCHAR(100) NULL;
