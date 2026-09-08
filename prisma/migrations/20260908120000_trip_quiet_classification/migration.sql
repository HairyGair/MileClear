-- Quiet classification with undo. The server already auto-applied a learned
-- classification at create time (80% agreement, 3 matches) but stored no
-- marker, so the app could neither show that it had happened nor offer an
-- undo, and the learner could not tell a driver's decision from its own.
ALTER TABLE `trips`
  ADD COLUMN `classificationSource` VARCHAR(30) NULL,
  ADD COLUMN `autoClassifiedAt` DATETIME(3) NULL,
  ADD COLUMN `preAutoClassification` VARCHAR(20) NULL;
