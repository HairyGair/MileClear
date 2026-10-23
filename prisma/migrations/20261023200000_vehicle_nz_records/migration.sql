-- AlterTable: vehicles, New Zealand answers + odometer unit
-- nzRecordBasis: "records" (a logbook of 90+ days or full records) | "none".
-- nzHybridKind: "petrol" | "plugin" | "diesel" | "mild". Both null until a
-- New Zealand driver answers; UK drivers never see them. odometerUnit: what
-- the car's odometer reads in; every existing vehicle is miles, so nothing
-- changes for anyone.
ALTER TABLE `vehicles`
  ADD COLUMN `nzRecordBasis` VARCHAR(16) NULL,
  ADD COLUMN `nzHybridKind` VARCHAR(16) NULL,
  ADD COLUMN `odometerUnit` VARCHAR(8) NOT NULL DEFAULT 'miles';
