-- Phase 3 of the "Money Picture" stack (22 May 2026).
-- Freeform per-record project / client tag on Trip, Earning, Expense.
-- Drives the new /business-insights/project-pnl roll-up.

ALTER TABLE `trips`
  ADD COLUMN `projectLabel` VARCHAR(100) NULL;

ALTER TABLE `earnings`
  ADD COLUMN `projectLabel` VARCHAR(100) NULL;

ALTER TABLE `expenses`
  ADD COLUMN `projectLabel` VARCHAR(100) NULL;
