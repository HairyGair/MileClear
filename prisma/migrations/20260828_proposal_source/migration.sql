-- Missed-journey proposals can now come from two places.
--
-- "gap" rows are inferred from a hole between two captured trips, and the scan
-- recreates and prunes them on every run. "recorded" rows are drives the engine
-- genuinely recorded and then threw away for being under the minimum distance
-- (MIN_AUTO_TRIP_DISTANCE_MILES). Those are evidence rather than inference and
-- the scan must never prune them, hence the column.
ALTER TABLE `missed_journey_proposals`
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'gap',
  ADD COLUMN `recordedMiles` DOUBLE NULL;
