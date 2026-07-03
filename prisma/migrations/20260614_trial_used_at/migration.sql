-- Free-trial eligibility tracking.
-- Stamped once when a user's first trial begins; never cleared on cancellation,
-- so cancel-and-resubscribe cannot re-trigger a fresh trial. NULL = eligible.
ALTER TABLE `users` ADD COLUMN `trialUsedAt` DATETIME(3) NULL;
