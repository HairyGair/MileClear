-- The trips list endpoint was slow 31,184 times in the first week of
-- September (avg 2,437 ms, 477 users) and the largest single cost was a
-- correlated COUNT(*) against trip_coordinates (10.5M rows) on every row of
-- every page, feeding the confidence badge. Store the count on the trip.
ALTER TABLE `trips` ADD COLUMN `coordinateCount` INTEGER NOT NULL DEFAULT 0;

-- Backfill from the coordinates table (one-off; ~55k trips).
UPDATE `trips` t
SET t.`coordinateCount` = (
  SELECT COUNT(*) FROM `trip_coordinates` c WHERE c.`tripId` = t.`id`
);

-- The classification suggester and POST /trips both filter on end
-- coordinates, which had no index (only [startLat, startLng] existed). The
-- Trips tab fired up to ten of these per open.
CREATE INDEX `trips_endLat_endLng_idx` ON `trips`(`endLat`, `endLng`);
