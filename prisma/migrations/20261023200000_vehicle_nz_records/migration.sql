-- AlterTable: vehicles, New Zealand answers + odometer unit
-- nzRecordBasis: "records" (a logbook of 90+ days or full records) | "none".
-- nzHybridKind: "petrol" | "plugin" | "diesel" | "mild".
-- odometerUnit: "miles" | "km", what the car's odometer reads in; readings
-- are stored in miles either way. All three null until the driver answers
-- (an unanswered unit is treated as miles), so nothing changes for anyone.
ALTER TABLE `vehicles`
  ADD COLUMN `nzRecordBasis` VARCHAR(16) NULL,
  ADD COLUMN `nzHybridKind` VARCHAR(16) NULL,
  ADD COLUMN `odometerUnit` VARCHAR(8) NULL;
