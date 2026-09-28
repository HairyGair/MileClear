-- The phone's "Drive detection" (automatic trips) switch, as last reported on
-- the heartbeat.
--
-- 28 Sep 2026: a shift-only driver who had switched automatic trips off was
-- still offered "journeys to check" for private drives between shifts and told
-- about ignored walks in the evening push. The setting lived only on the
-- phone. NULL means unknown (an app too old to report it) and is treated as on.
ALTER TABLE `users` ADD COLUMN `driveDetectionEnabled` BOOLEAN NULL;
