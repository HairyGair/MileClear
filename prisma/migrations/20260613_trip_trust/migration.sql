-- Trip trust primitives (13 June 2026).
--
-- odometerStart/odometerEnd: optional odometer readings (miles) that
-- corroborate the GPS distance — an auditable HMRC-defence signal.
-- updatedAt: edit audit trail so the UI can show when a trip was last changed
-- (a wrong figure is never silently rewritten without a trace). Backfilled to
-- createdAt for existing rows so they don't all look "edited just now".
ALTER TABLE `trips`
  ADD COLUMN `odometerStart` DOUBLE NULL,
  ADD COLUMN `odometerEnd` DOUBLE NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `trips` SET `updatedAt` = `createdAt`;
