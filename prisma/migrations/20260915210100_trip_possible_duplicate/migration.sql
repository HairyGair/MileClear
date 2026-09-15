-- Possible double-count marker on trips.
--
-- In the 14 days to 15 Sep 2026, 104 of 661 hand-added trips overlapped in
-- time with a trip the app recorded for the same driver (3,406 miles counted
-- twice). Two shapes: the driver adds a drive by hand and the real recording
-- lands later (the server watchdog can deliver a trip hours late), or the
-- driver accepts a missed-journey suggestion and the app then fills that gap.
-- Nothing flagged either. POST /trips now sets this on the NEWER trip when an
-- existing trip overlaps by half the shorter duration and both ends are within
-- 0.5 mi. Nothing is deleted automatically: the app offers a merge, and
-- "Keep both" clears the column.
ALTER TABLE `trips` ADD COLUMN `possibleDuplicateOfId` VARCHAR(191) NULL;

CREATE INDEX `trips_userId_possibleDuplicateOfId_idx` ON `trips`(`userId`, `possibleDuplicateOfId`);
