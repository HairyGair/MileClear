-- When a driver accepted or dismissed a missed-journey suggestion.
--
-- updatedAt could not answer that: the scan (GET /missed-journeys) upserted
-- every candidate with `update: { source }`, which bumped @updatedAt on rows
-- that had been decided weeks earlier. The scan now leaves decided rows alone
-- and the resolve endpoint stamps this column, so it is null until a decision
-- and then never touched again.
ALTER TABLE `missed_journey_proposals` ADD COLUMN `decidedAt` DATETIME(3) NULL;
